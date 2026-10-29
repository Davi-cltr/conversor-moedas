import { Big } from '../domain/money'
import type { MarketQuote } from '../domain/rates'
import { BASE_CURRENCY, QUOTED_CODES, pairHistorySource } from '../domain/currencies'
import { pairSeries, type Point } from '../domain/series'
import type { DateRange } from '../domain/periods'
import { readCache, shared, writeCache, type Codec } from './cache'
import { fetchAwesomeDaily, fetchLatestQuotes, type LatestQuotes } from './awesome'
import { fetchPtaxSeries } from './ptax'

/* ---------- cotações comerciais ---------- */

export const latestKey = 'latest'

export function loadLatest(signal: AbortSignal): Promise<LatestQuotes> {
  return shared(latestKey, (s) => fetchLatestQuotes(QUOTED_CODES, s), signal)
}

type RawQuote = Record<keyof Omit<MarketQuote, 'code' | 'timestamp'>, string> & { code: string; timestamp: number }

export const latestCodec: Codec<LatestQuotes> = {
  encode: (d) => ({
    missing: d.missing,
    book: Object.fromEntries(
      Object.entries(d.book).map(([k, q]) => [
        k,
        {
          code: q.code,
          bid: q.bid.toString(),
          ask: q.ask.toString(),
          high: q.high.toString(),
          low: q.low.toString(),
          pctChange: q.pctChange.toString(),
          timestamp: q.timestamp,
        } satisfies RawQuote,
      ]),
    ),
  }),
  decode: (raw) => {
    try {
      const r = raw as { book: Record<string, RawQuote>; missing: string[] }
      const book: Record<string, MarketQuote> = {}
      for (const [k, q] of Object.entries(r.book)) {
        book[k] = {
          code: q.code,
          bid: new Big(q.bid),
          ask: new Big(q.ask),
          high: new Big(q.high),
          low: new Big(q.low),
          pctChange: new Big(q.pctChange),
          timestamp: Number(q.timestamp),
        }
      }
      return Object.keys(book).length ? { book, missing: Array.isArray(r.missing) ? r.missing : [] } : null
    } catch {
      return null
    }
  },
}

/* ---------- histórico ---------- */

export interface PairHistory {
  base: string
  quote: string
  source: 'ptax' | 'awesome'
  range: DateRange
  /** Unidades de `quote` por 1 `base`, uma por data com dado nas duas pontas. */
  points: Point[]
  /** Instante do boletim PTAX mais recente usado (somente PTAX). */
  lastPublishedAt: number | null
}

function legKey(source: string, code: string, range: DateRange) {
  return `leg:${source}:${code}:${range.start}:${range.end}`
}

interface Leg {
  points: Point[]
  lastPublishedAt: number | null
}

const LEG_TTL_MS = 30 * 60_000

function loadLeg(source: 'ptax' | 'awesome', code: string, range: DateRange, signal: AbortSignal): Promise<Leg> {
  const key = legKey(source, code, range)
  // pernas já baixadas nesta sessão são reaproveitadas (ex.: comparação entre moedas)
  const hit = readCache<Leg>(key)
  if (hit && Date.now() - hit.savedAt < LEG_TTL_MS) return Promise.resolve(hit.data)
  return shared(
    key,
    async (s) => {
      const leg = await fetchLeg(source, code, range, s)
      writeCache(key, leg)
      return leg
    },
    signal,
  )
}

async function fetchLeg(source: 'ptax' | 'awesome', code: string, range: DateRange, s: AbortSignal): Promise<Leg> {
  if (source === 'ptax') {
    const pts = await fetchPtaxSeries(code, range.start, range.end, s)
    return {
      points: pts.map((p) => ({ date: p.date, value: p.value })),
      lastPublishedAt: pts.length ? pts[pts.length - 1].publishedAt : null,
    }
  }
  return { points: await fetchAwesomeDaily(code, range.start, range.end, s), lastPublishedAt: null }
}

export function historyKey(base: string, quote: string, range: DateRange): string {
  return `pair:${pairHistorySource(base, quote)}:${base}:${quote}:${range.start}:${range.end}`
}

export async function loadPairHistory(base: string, quote: string, range: DateRange, signal: AbortSignal): Promise<PairHistory> {
  const source = pairHistorySource(base, quote)
  const [b, q] = await Promise.all([
    base === BASE_CURRENCY ? null : loadLeg(source, base, range, signal),
    quote === BASE_CURRENCY ? null : loadLeg(source, quote, range, signal),
  ])
  const published = [b?.lastPublishedAt, q?.lastPublishedAt].filter((x): x is number => typeof x === 'number')
  return {
    base,
    quote,
    source,
    range,
    points: pairSeries(b?.points ?? null, q?.points ?? null),
    lastPublishedAt: published.length ? Math.min(...published) : null,
  }
}

export const historyCodec: Codec<PairHistory> = {
  encode: (h) => ({ ...h, points: h.points.map((p) => [p.date, p.value]) }),
  decode: (raw) => {
    const r = raw as Omit<PairHistory, 'points'> & { points: [string, number][] }
    if (!r || !Array.isArray(r.points)) return null
    return { ...r, points: r.points.map(([date, value]) => ({ date, value })) }
  },
}

/**
 * Carrega séries PTAX de várias moedas em reais, com no máximo `concurrency`
 * requisições simultâneas. Falhas isoladas voltam como `Error` no resultado;
 * se TODAS falharem, a função rejeita com o primeiro erro — assim a interface
 * mostra a falha em vez de concluir que "não há dados".
 */
export async function loadPtaxLegs(
  codes: readonly string[],
  range: DateRange,
  signal: AbortSignal,
  concurrency = 4,
): Promise<Record<string, Leg | Error>> {
  const out: Record<string, Leg | Error> = {}
  const queue = [...codes]
  async function worker() {
    while (queue.length) {
      const code = queue.shift()!
      try {
        out[code] = await loadLeg('ptax', code, range, signal)
      } catch (e) {
        if (signal.aborted) throw e
        out[code] = e instanceof Error ? e : new Error(String(e))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, codes.length) }, worker))
  const results = Object.values(out)
  if (results.length > 0 && results.every((r) => r instanceof Error)) throw results[0]
  return out
}
