import { parsePtaxDateTime, toPtaxParam, type IsoDate } from '../domain/dates'
import type { Point } from '../domain/series'
import { ApiError, getJson, isRecord } from './http'

export const PTAX_BASE = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata'
export const PTAX_SOURCE = 'API PTAX do Banco Central'

export interface PtaxPoint extends Point {
  /** PTAX de compra, em reais. */
  buy: number
  /** Instante do boletim de fechamento (ms). */
  publishedAt: number
}

/** encodeURIComponent não codifica aspas simples, que o OData usa em literais. */
const enc = (s: string) => encodeURIComponent(s).replaceAll("'", '%27')

export function ptaxPeriodUrl(code: string, start: IsoDate, end: IsoDate): string {
  const params = [
    `@moeda=${enc(`'${code}'`)}`,
    `@dataInicial=${enc(`'${toPtaxParam(start)}'`)}`,
    `@dataFinalCotacao=${enc(`'${toPtaxParam(end)}'`)}`,
    `$filter=${enc("tipoBoletim eq 'Fechamento'")}`,
    `$select=${enc('cotacaoCompra,cotacaoVenda,dataHoraCotacao,tipoBoletim')}`,
    '$format=json',
  ]
  return `${PTAX_BASE}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?${params.join('&')}`
}

/**
 * Normaliza a resposta do recurso CotacaoMoedaPeriodo. Mantém só o boletim
 * de fechamento (a PTAX do dia); `value` é a PTAX de venda, a referência
 * mais usada em contratos e na imprensa.
 */
export function normalizePtax(payload: unknown): PtaxPoint[] {
  if (!isRecord(payload) || !Array.isArray(payload.value)) {
    throw new ApiError('invalid', PTAX_SOURCE, 'O Banco Central enviou um histórico em formato inesperado.')
  }
  const byDate = new Map<IsoDate, PtaxPoint>()
  for (const row of payload.value) {
    if (!isRecord(row)) continue
    if (row.tipoBoletim !== undefined && row.tipoBoletim !== 'Fechamento') continue
    const sell = Number(row.cotacaoVenda)
    const buy = Number(row.cotacaoCompra)
    const when = typeof row.dataHoraCotacao === 'string' ? parsePtaxDateTime(row.dataHoraCotacao) : null
    if (!when || !(sell > 0) || !(buy > 0)) continue
    const prev = byDate.get(when.date)
    if (!prev || when.epochMs > prev.publishedAt) {
      byDate.set(when.date, { date: when.date, value: sell, buy, publishedAt: when.epochMs })
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

export async function fetchPtaxSeries(code: string, start: IsoDate, end: IsoDate, signal?: AbortSignal): Promise<PtaxPoint[]> {
  const payload = await getJson(ptaxPeriodUrl(code, start, end), { signal, source: PTAX_SOURCE, timeoutMs: 20_000 })
  return normalizePtax(payload)
}
