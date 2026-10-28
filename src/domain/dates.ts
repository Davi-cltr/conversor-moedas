/**
 * Datas de calendário são representadas como strings ISO `AAAA-MM-DD`.
 * Toda a aritmética é feita em UTC para não sofrer com fuso horário ou
 * horário de verão do navegador; o "hoje" é sempre o de Brasília.
 */

export type IsoDate = string

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000
export const BRAZIL_TZ = 'America/Sao_Paulo'

export function isIsoDate(value: string): value is IsoDate {
  const m = ISO_RE.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

function toUtcMs(iso: IsoDate): number {
  const m = ISO_RE.exec(iso)
  if (!m) throw new RangeError(`Data inválida: ${iso}`)
  return Date.UTC(+m[1], +m[2] - 1, +m[3])
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(iso) + days * DAY_MS)
}

export function addYears(iso: IsoDate, years: number): IsoDate {
  const d = new Date(toUtcMs(iso))
  const month = d.getUTCMonth()
  d.setUTCFullYear(d.getUTCFullYear() + years)
  // 29/02 em ano não bissexto vira 28/02, não 01/03.
  if (d.getUTCMonth() !== month) d.setUTCDate(0)
  return fromUtcMs(d.getTime())
}

/** Diferença em dias de calendário (b − a). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS)
}

/** 0 = domingo … 6 = sábado. */
export function weekday(iso: IsoDate): number {
  return new Date(toUtcMs(iso)).getUTCDay()
}

export function isWeekend(iso: IsoDate): boolean {
  const d = weekday(iso)
  return d === 0 || d === 6
}

/** Dias úteis (seg–sex) estritamente entre a e b. Não conhece feriados. */
export function businessDaysBetween(a: IsoDate, b: IsoDate): number {
  let count = 0
  for (let d = addDays(a, 1); d < b; d = addDays(d, 1)) if (!isWeekend(d)) count++
  return count
}

const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BRAZIL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Data de calendário em Brasília para um instante (ms desde a época). */
export function isoDateInBrazil(epochMs: number): IsoDate {
  return isoFormatter.format(new Date(epochMs))
}

export function todayInBrazil(now: number = Date.now()): IsoDate {
  return isoDateInBrazil(now)
}

/** Parâmetro de data da API PTAX do Banco Central: `MM-DD-AAAA`. */
export function toPtaxParam(iso: IsoDate): string {
  const [y, m, d] = iso.split('-')
  return `${m}-${d}-${y}`
}

/** Parâmetro de data da AwesomeAPI: `AAAAMMDD`. */
export function toAwesomeParam(iso: IsoDate): string {
  return iso.replaceAll('-', '')
}

/**
 * Converte `2026-10-19 13:05:47.20983` (hora de Brasília, sem fuso) em
 * data ISO + instante. O Brasil não adota horário de verão desde 2019;
 * para datas anteriores o horário pode estar 1h deslocado, mas a data de
 * calendário — a única usada nos cálculos — continua correta.
 */
export function parsePtaxDateTime(raw: string): { date: IsoDate; epochMs: number } | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(raw)
  if (!m || !isIsoDate(m[1])) return null
  const epochMs = Date.parse(`${m[1]}T${m[2]}:${m[3]}:00-03:00`)
  return Number.isFinite(epochMs) ? { date: m[1], epochMs } : null
}

const shortDate = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' })
const longDate = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
const weekdayDate = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
const axisDay = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const axisMonth = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'short', year: '2-digit' })
const axisYear = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: BRAZIL_TZ, hour: '2-digit', minute: '2-digit' })
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRAZIL_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export type DateStyle = 'short' | 'long' | 'weekday' | 'axis-day' | 'axis-month' | 'axis-year'

export function formatDate(iso: IsoDate, style: DateStyle = 'short'): string {
  const d = new Date(toUtcMs(iso))
  switch (style) {
    case 'long':
      return longDate.format(d)
    case 'weekday':
      return weekdayDate.format(d)
    case 'axis-day':
      return axisDay.format(d).replace('.', '')
    case 'axis-month':
      return axisMonth.format(d).replace('.', '').replace(' de ', ' ')
    case 'axis-year':
      return axisYear.format(d)
    default:
      return shortDate.format(d)
  }
}

export function formatTime(epochMs: number): string {
  return timeFmt.format(new Date(epochMs))
}

export function formatDateTime(epochMs: number): string {
  return dateTimeFmt.format(new Date(epochMs)).replace(',', ' às')
}

/**
 * Descreve quando um dado foi publicado, relativo a agora:
 * "hoje às 16:03", "ontem às 17:59", "sexta-feira, 23 de outubro às 17:59".
 */
export function describeMoment(epochMs: number, now: number = Date.now()): string {
  const day = isoDateInBrazil(epochMs)
  const today = todayInBrazil(now)
  const time = formatTime(epochMs)
  const delta = diffDays(day, today)
  if (delta === 0) return `hoje às ${time}`
  if (delta === 1) return `ontem às ${time}`
  if (delta > 1 && delta < 7) return `${formatDate(day, 'weekday')} às ${time}`
  return formatDateTime(epochMs)
}
