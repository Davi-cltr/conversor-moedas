/**
 * `fetch` simulado para testes de interface. Responde no formato real das
 * duas APIs usando as amostras de `fixtures.ts`. A aplicação nunca importa
 * este arquivo.
 */
import { vi } from 'vitest'
import { awesomeLatestSample, syntheticPtax } from './fixtures'

export interface MockOptions {
  /** Nível da PTAX de venda por moeda (o resto da série é derivado). */
  ptaxLevel?: Record<string, number>
  /** Faz todas as requisições falharem como erro de rede. */
  offline?: boolean
  /** Responde a AwesomeAPI /json/last com este objeto. */
  latest?: unknown
}

const DEFAULT_LEVEL: Record<string, number> = {
  USD: 5.03,
  EUR: 5.84,
  GBP: 6.7,
  JPY: 0.0331,
  CAD: 3.6,
  AUD: 3.3,
  CHF: 6.3,
  DKK: 0.78,
  NOK: 0.49,
  SEK: 0.53,
}

function fromPtaxParam(p: string): string {
  const [m, d, y] = p.replaceAll("'", '').split('-')
  return `${y}-${m}-${d}`
}

export function mockFetch(opts: MockOptions = {}) {
  const level = { ...DEFAULT_LEVEL, ...opts.ptaxLevel }
  const calls: string[] = []
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (opts.offline) throw new TypeError('Failed to fetch')
    if (url.includes('/json/last/')) return json(opts.latest ?? awesomeLatestSample)
    if (url.includes('CotacaoMoedaPeriodo')) {
      const u = new URL(url)
      const code = u.searchParams.get('@moeda')!.replaceAll("'", '')
      const start = fromPtaxParam(u.searchParams.get('@dataInicial')!)
      const end = fromPtaxParam(u.searchParams.get('@dataFinalCotacao')!)
      const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1
      return json(syntheticPtax(start, days, level[code] ?? 1))
    }
    return new Response('', { status: 404 })
  })
  vi.stubGlobal('fetch', impl)
  return { impl, calls }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
