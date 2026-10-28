import { Big, percentChange } from './money'
import { addDays, businessDaysBetween, type IsoDate } from './dates'

/** Um valor por data de calendário, em ordem crescente de data. */
export interface Point {
  date: IsoDate
  value: number
}

export type Series = readonly Point[]

/**
 * Série de um par a partir de duas séries em reais.
 * `base` e `quote` são "reais por 1 unidade"; `null` representa o próprio real.
 * Resultado: unidades de `quote` por 1 unidade de `base`, só nas datas
 * presentes nas duas séries — nada é interpolado.
 */
export function pairSeries(base: Series | null, quote: Series | null): Point[] {
  if (!base && !quote) return []
  if (!quote) return base!.map((p) => ({ ...p }))
  if (!base) return quote.map((p) => ({ date: p.date, value: toNumber(new Big(1).div(p.value)) }))
  const quoteByDate = new Map(quote.map((p) => [p.date, p.value]))
  const out: Point[] = []
  for (const p of base) {
    const q = quoteByDate.get(p.date)
    if (q !== undefined && q !== 0) out.push({ date: p.date, value: toNumber(new Big(p.value).div(q)) })
  }
  return out
}

function toNumber(b: Big): number {
  return Number(b.toPrecision(12))
}

/** Pontos com data dentro de [start, end], inclusive. */
export function sliceRange(series: Series, start: IsoDate, end: IsoDate): Point[] {
  return series.filter((p) => p.date >= start && p.date <= end)
}

export interface SeriesStats {
  first: Point
  last: Point
  max: Point
  min: Point
  absChange: Big
  /** Em pontos percentuais. */
  pctChange: Big
  count: number
}

/** Indicadores do período. Precisa de pelo menos um ponto; a variação é 0 com um só. */
export function computeStats(series: Series): SeriesStats | null {
  if (series.length === 0) return null
  let max = series[0]
  let min = series[0]
  for (const p of series) {
    if (p.value > max.value) max = p
    if (p.value < min.value) min = p
  }
  const first = series[0]
  const last = series[series.length - 1]
  return {
    first,
    last,
    max,
    min,
    absChange: new Big(last.value).minus(first.value),
    pctChange: percentChange(first.value, last.value),
    count: series.length,
  }
}

/** Último ponto com data ≤ `date`. */
export function pointOnOrBefore(series: Series, date: IsoDate): Point | null {
  let lo = 0
  let hi = series.length - 1
  let found: Point | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (series[mid].date <= date) {
      found = series[mid]
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

export interface Change {
  from: Point
  to: Point
  pct: Big
  abs: Big
}

/**
 * Variação entre o último ponto da série e o último ponto disponível
 * `days` dias de calendário antes dele. Null se a série não alcança tão longe.
 */
export function changeOverDays(series: Series, days: number): Change | null {
  if (series.length < 2) return null
  const to = series[series.length - 1]
  const target = addDays(to.date, -days)
  if (series[0].date > target) return null
  const from = pointOnOrBefore(series, target)
  if (!from || from === to) return null
  return { from, to, pct: percentChange(from.value, to.value), abs: new Big(to.value).minus(from.value) }
}

/** Série reescrita como variação % desde o primeiro ponto (comparação entre moedas). */
export function rebaseToPercent(series: Series): Point[] {
  if (series.length === 0) return []
  const base = series[0].value
  return series.map((p) => ({ date: p.date, value: toNumber(percentChange(base, p.value)) }))
}

export interface Gap {
  after: IsoDate
  before: IsoDate
  /** Dias úteis sem cotação (pode incluir feriados). */
  missingBusinessDays: number
}

/** Intervalos entre pontos consecutivos em que faltam dias úteis. */
export function findGaps(series: Series): Gap[] {
  const gaps: Gap[] = []
  for (let i = 1; i < series.length; i++) {
    const missing = businessDaysBetween(series[i - 1].date, series[i].date)
    if (missing > 0) gaps.push({ after: series[i - 1].date, before: series[i].date, missingBusinessDays: missing })
  }
  return gaps
}

/**
 * Reduz a série para desenhar em `buckets` colunas, preservando a mínima e a
 * máxima de cada coluna (o desenho continua fiel a picos e vales).
 * Os cálculos usam sempre a série completa.
 */
export function downsampleMinMax(series: Series, buckets: number): Point[] {
  if (series.length <= buckets * 2 || buckets < 1) return [...series]
  const out: Point[] = [series[0]]
  const size = (series.length - 2) / buckets
  for (let b = 0; b < buckets; b++) {
    const start = 1 + Math.floor(b * size)
    const end = Math.min(series.length - 1, 1 + Math.floor((b + 1) * size))
    let lo = series[start]
    let hi = series[start]
    for (let i = start; i < end; i++) {
      if (series[i].value < lo.value) lo = series[i]
      if (series[i].value > hi.value) hi = series[i]
    }
    if (lo === hi) out.push(lo)
    else if (lo.date < hi.date) out.push(lo, hi)
    else out.push(hi, lo)
  }
  out.push(series[series.length - 1])
  return out
}

/** Índice do ponto com data mais próxima (busca binária). */
export function nearestIndex(series: Series, date: IsoDate): number {
  if (series.length === 0) return -1
  let lo = 0
  let hi = series.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (series[mid].date < date) lo = mid + 1
    else hi = mid
  }
  if (lo > 0) {
    const a = series[lo - 1].date
    const b = series[lo].date
    // compara distâncias pelo comprimento de calendário
    if (Math.abs(dateNum(date) - dateNum(a)) <= Math.abs(dateNum(b) - dateNum(date))) return lo - 1
  }
  return lo
}

function dateNum(iso: IsoDate): number {
  return Date.parse(`${iso}T00:00:00Z`)
}

/** Marcas "redondas" para um eixo numérico. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (min === max) {
    const pad = Math.abs(min) * 0.01 || 1
    min -= pad
    max += pad
  }
  const span = max - min
  const rough = span / Math.max(1, count - 1)
  const mag = 10 ** Math.floor(Math.log10(rough))
  // escolhe o passo "redondo" cuja quantidade de marcas fica mais perto da pedida
  let step = mag
  let bestDiff = Infinity
  for (const m of [0.5, 1, 2, 2.5, 5, 10]) {
    const s = m * mag
    const n = Math.floor(max / s + 1e-9) - Math.ceil(min / s - 1e-9) + 1
    const diff = Math.abs(n - count) + (n < 2 ? 10 : 0)
    if (diff < bestDiff) {
      bestDiff = diff
      step = s
    }
  }
  const start = Math.ceil(min / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)))
  return ticks
}
