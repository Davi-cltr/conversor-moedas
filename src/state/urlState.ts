import { isSupported, PTAX_CODES } from '../domain/currencies'
import { isIsoDate } from '../domain/dates'
import { PRESETS, type PeriodSelection, type PresetId } from '../domain/periods'
import { formatPlain, MAX_FRACTION_DIGITS, parseBrazilianNumber } from '../domain/money'

/**
 * Estado compartilhável na URL: ?de=USD&para=BRL&valor=100&periodo=90d
 * (ou periodo=2024-01-01_2024-06-30) e &comparar=USD,EUR.
 * Valores inválidos na URL são ignorados em favor dos padrões.
 */
export interface AppState {
  from: string
  to: string
  amountText: string
  period: PeriodSelection
  compare: string[] | null
}

export const DEFAULT_STATE: AppState = {
  from: 'USD',
  to: 'BRL',
  amountText: '100',
  period: { kind: 'preset', id: '30d' },
  compare: null,
}

export function readState(search: string): AppState {
  const q = new URLSearchParams(search)
  const from = q.get('de')?.toUpperCase()
  const to = q.get('para')?.toUpperCase()
  const valor = q.get('valor')
  const periodo = q.get('periodo')
  const comparar = q.get('comparar')

  let period = DEFAULT_STATE.period
  if (periodo && PRESETS.some((p) => p.id === periodo)) period = { kind: 'preset', id: periodo as PresetId }
  else if (periodo && /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(periodo)) {
    const [start, end] = periodo.split('_')
    if (isIsoDate(start) && isIsoDate(end) && start < end) period = { kind: 'custom', range: { start, end } }
  }

  const compare = comparar
    ? comparar
        .toUpperCase()
        .split(',')
        .filter((c, i, arr) => PTAX_CODES.includes(c) && arr.indexOf(c) === i)
        .slice(0, 5)
    : null

  return {
    from: from && isSupported(from) ? from : DEFAULT_STATE.from,
    to: to && isSupported(to) ? to : DEFAULT_STATE.to,
    amountText: readAmount(valor),
    period,
    compare: compare && compare.length ? compare : null,
  }
}

export function writeState(state: AppState): string {
  const q = new URLSearchParams()
  q.set('de', state.from)
  q.set('para', state.to)
  const parsed = parseBrazilianNumber(state.amountText)
  if (parsed.ok) q.set('valor', state.amountText.trim())
  q.set('periodo', state.period.kind === 'preset' ? state.period.id : `${state.period.range.start}_${state.period.range.end}`)
  if (state.compare?.length) q.set('comparar', state.compare.join(','))
  return `?${q.toString()}`
}

/** Valor vindo da URL já exibido com os separadores brasileiros ("1000" → "1.000"). */
function readAmount(valor: string | null): string {
  if (!valor) return DEFAULT_STATE.amountText
  const parsed = parseBrazilianNumber(valor)
  return parsed.ok ? formatPlain(parsed.value, MAX_FRACTION_DIGITS) : DEFAULT_STATE.amountText
}
