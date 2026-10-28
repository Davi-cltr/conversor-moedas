import { addDays, addYears, diffDays, isIsoDate, type IsoDate } from './dates'

export type PresetId = '7d' | '30d' | '90d' | '180d' | '1a'

export interface Preset {
  id: PresetId
  label: string
  /** Rótulo por extenso para leitores de tela e textos. */
  long: string
  days: number
}

export const PRESETS: readonly Preset[] = [
  { id: '7d', label: '7 dias', long: 'últimos 7 dias', days: 7 },
  { id: '30d', label: '30 dias', long: 'últimos 30 dias', days: 30 },
  { id: '90d', label: '90 dias', long: 'últimos 90 dias', days: 90 },
  { id: '180d', label: '180 dias', long: 'últimos 180 dias', days: 180 },
  { id: '1a', label: '1 ano', long: 'último ano', days: 365 },
]

export interface DateRange {
  start: IsoDate
  end: IsoDate
}

export type PeriodSelection = { kind: 'preset'; id: PresetId } | { kind: 'custom'; range: DateRange }

export function presetRange(id: PresetId, today: IsoDate): DateRange {
  const p = PRESETS.find((x) => x.id === id)!
  return { start: id === '1a' ? addYears(today, -1) : addDays(today, -p.days), end: today }
}

export function selectionRange(sel: PeriodSelection, today: IsoDate): DateRange {
  return sel.kind === 'preset' ? presetRange(sel.id, today) : sel.range
}

/** Janela que cobre todos os presets: buscada uma vez e fatiada localmente. */
export function presetWindow(today: IsoDate): DateRange {
  // alguns dias a mais para que "variação em 1 ano" encontre o ponto anterior
  return { start: addDays(addYears(today, -1), -10), end: today }
}

export const PTAX_MIN_DATE: IsoDate = '1999-01-04'
export const MAX_CUSTOM_YEARS_PTAX = 10
/** A AwesomeAPI devolve no máximo 360 registros diários por consulta. */
export const MAX_CUSTOM_DAYS_AWESOME = 365

export type RangeProblem =
  | 'invalid-date'
  | 'start-after-end'
  | 'future'
  | 'too-old'
  | 'too-long'
  | 'too-short'

export function validateRange(
  range: { start: string; end: string },
  opts: { today: IsoDate; source: 'ptax' | 'awesome' },
): RangeProblem | null {
  if (!isIsoDate(range.start) || !isIsoDate(range.end)) return 'invalid-date'
  if (range.start > range.end) return 'start-after-end'
  if (range.end > opts.today) return 'future'
  if (range.start < PTAX_MIN_DATE) return 'too-old'
  const span = diffDays(range.start, range.end)
  if (span < 2) return 'too-short'
  if (opts.source === 'ptax' && range.start < addYears(range.end, -MAX_CUSTOM_YEARS_PTAX)) return 'too-long'
  if (opts.source === 'awesome' && span > MAX_CUSTOM_DAYS_AWESOME) return 'too-long'
  return null
}

export function rangeProblemText(problem: RangeProblem, source: 'ptax' | 'awesome'): string {
  switch (problem) {
    case 'invalid-date':
      return 'Informe as duas datas do período.'
    case 'start-after-end':
      return 'A data inicial precisa ser anterior à final.'
    case 'future':
      return 'A data final não pode estar no futuro.'
    case 'too-old':
      return 'O histórico disponível começa em 04/01/1999.'
    case 'too-long':
      return source === 'ptax'
        ? `Escolha um período de até ${MAX_CUSTOM_YEARS_PTAX} anos.`
        : 'Para esta moeda, a fonte permite consultar até 1 ano por vez.'
    case 'too-short':
      return 'Escolha um período de pelo menos 3 dias.'
  }
}
