import { Big } from '../domain/money'
import type { MarketQuote, QuoteBook } from '../domain/rates'
import { isoDateInBrazil, toAwesomeParam, type IsoDate } from '../domain/dates'
import type { Point } from '../domain/series'
import { ApiError, getJson, isRecord, readPositiveNumeric } from './http'

export const AWESOME_BASE = 'https://economia.awesomeapi.com.br'
export const AWESOME_SOURCE = 'AwesomeAPI'

export interface LatestQuotes {
  book: QuoteBook
  /** Moedas pedidas que não vieram (ou vieram inválidas). */
  missing: string[]
}

export function latestUrl(codes: readonly string[]): string {
  return `${AWESOME_BASE}/json/last/${codes.map((c) => `${c}-BRL`).join(',')}`
}

/** Normaliza a resposta de /json/last. Exportada para testes. */
export function normalizeLatest(payload: unknown, codes: readonly string[]): LatestQuotes {
  if (!isRecord(payload)) throw new ApiError('invalid', AWESOME_SOURCE, 'A AwesomeAPI enviou cotações em formato inesperado.')
  const book: Record<string, MarketQuote> = {}
  const missing: string[] = []
  for (const code of codes) {
    const entry = payload[`${code}BRL`]
    const quote = isRecord(entry) ? readQuote(code, entry) : null
    if (quote) book[code] = quote
    else missing.push(code)
  }
  if (Object.keys(book).length === 0) {
    throw new ApiError('invalid', AWESOME_SOURCE, 'A AwesomeAPI não enviou nenhuma cotação válida.')
  }
  return { book, missing }
}

function readQuote(code: string, e: Record<string, unknown>): MarketQuote | null {
  const bid = readPositiveNumeric(e.bid)
  const ask = readPositiveNumeric(e.ask)
  const ts = Number(e.timestamp)
  if (!bid || !ask || !Number.isFinite(ts) || ts <= 0) return null
  const high = readPositiveNumeric(e.high) ?? ask
  const low = readPositiveNumeric(e.low) ?? bid
  const pct = typeof e.pctChange === 'string' || typeof e.pctChange === 'number' ? String(e.pctChange) : '0'
  let pctChange: Big
  try {
    pctChange = new Big(pct)
  } catch {
    pctChange = new Big(0)
  }
  return {
    code,
    bid: new Big(bid),
    ask: new Big(ask),
    high: new Big(high),
    low: new Big(low),
    pctChange,
    // a AwesomeAPI informa segundos
    timestamp: ts < 1e12 ? ts * 1000 : ts,
  }
}

export async function fetchLatestQuotes(codes: readonly string[], signal?: AbortSignal): Promise<LatestQuotes> {
  const payload = await getJson(latestUrl(codes), { signal, source: AWESOME_SOURCE })
  return normalizeLatest(payload, codes)
}

export function dailyUrl(code: string, start: IsoDate, end: IsoDate): string {
  return `${AWESOME_BASE}/json/daily/${code}-BRL/360?start_date=${toAwesomeParam(start)}&end_date=${toAwesomeParam(end)}`
}

/**
 * Normaliza /json/daily: um ponto por data de Brasília (o registro mais
 * recente do dia), valor = ponto médio entre compra e venda, em reais.
 */
export function normalizeDaily(payload: unknown): Point[] {
  if (!Array.isArray(payload)) throw new ApiError('invalid', AWESOME_SOURCE, 'A AwesomeAPI enviou um histórico em formato inesperado.')
  const byDate = new Map<IsoDate, { ts: number; value: number }>()
  for (const entry of payload) {
    if (!isRecord(entry)) continue
    const bid = readPositiveNumeric(entry.bid)
    const ask = readPositiveNumeric(entry.ask)
    const ts = Number(entry.timestamp)
    if (!bid || !ask || !Number.isFinite(ts) || ts <= 0) continue
    const ms = ts < 1e12 ? ts * 1000 : ts
    const date = isoDateInBrazil(ms)
    const value = Number(new Big(bid).plus(ask).div(2).toPrecision(12))
    const prev = byDate.get(date)
    if (!prev || ms > prev.ts) byDate.set(date, { ts: ms, value })
  }
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, { value }]) => ({ date, value }))
}

export async function fetchAwesomeDaily(code: string, start: IsoDate, end: IsoDate, signal?: AbortSignal): Promise<Point[]> {
  try {
    const payload = await getJson(dailyUrl(code, start, end), { signal, source: AWESOME_SOURCE })
    return normalizeDaily(payload)
  } catch (error) {
    // a AwesomeAPI responde 404 quando não há registros no intervalo
    if (error instanceof ApiError && error.kind === 'not-found') return []
    throw error
  }
}
