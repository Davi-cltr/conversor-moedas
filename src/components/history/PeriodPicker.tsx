import { useId, useState, type FormEvent } from 'react'
import { addDays, addYears, formatDate, type IsoDate } from '../../domain/dates'
import { PRESETS, PTAX_MIN_DATE, rangeProblemText, validateRange, type PeriodSelection } from '../../domain/periods'
import { DateField } from '../DateField'
import s from './PeriodPicker.module.css'

interface Props {
  value: PeriodSelection
  onChange: (p: PeriodSelection) => void
  today: IsoDate
  source: 'ptax' | 'awesome'
}

export function PeriodPicker({ value, onChange, today, source }: Props) {
  const ids = useId()
  const [editing, setEditing] = useState(value.kind === 'custom')
  // sugestão inicial dentro do limite de cada fonte (a AwesomeAPI aceita até 1 ano por consulta)
  const initial =
    value.kind === 'custom' ? value.range : { start: source === 'ptax' ? addYears(today, -2) : addDays(today, -365), end: today }
  const [start, setStart] = useState<IsoDate | ''>(initial.start)
  const [end, setEnd] = useState<IsoDate | ''>(initial.end)
  const [problem, setProblem] = useState<string | null>(null)

  function apply(e: FormEvent) {
    e.preventDefault()
    const p = validateRange({ start, end }, { today, source })
    if (p) {
      setProblem(rangeProblemText(p, source))
      return
    }
    setProblem(null)
    onChange({ kind: 'custom', range: { start, end } })
  }

  const customActive = value.kind === 'custom'

  return (
    <div className={s.wrap}>
      <div className={`segmentos ${s.periodos}`} role="group" aria-label="Período do histórico">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={value.kind === 'preset' && value.id === p.id}
            aria-label={p.long}
            onClick={() => {
              setEditing(false)
              onChange({ kind: 'preset', id: p.id })
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={customActive || editing}
          aria-expanded={editing}
          aria-controls={`${ids}-form`}
          onClick={() => setEditing((v) => !v || !customActive)}
        >
          {customActive ? `${formatDate(value.range.start)} a ${formatDate(value.range.end)}` : 'Outro período'}
        </button>
      </div>

      {editing && (
        <form id={`${ids}-form`} className={s.form} onSubmit={apply} noValidate>
          <div className={s.campo}>
            <label htmlFor={`${ids}-ini`}>De</label>
            <DateField
              id={`${ids}-ini`}
              value={start}
              min={PTAX_MIN_DATE}
              max={today}
              onChange={setStart}
              invalid={!!problem}
              describedBy={`${ids}-msg`}
              calendarLabel="Abrir calendário da data inicial"
            />
          </div>
          <div className={s.campo}>
            <label htmlFor={`${ids}-fim`}>Até</label>
            <DateField
              id={`${ids}-fim`}
              value={end}
              min={PTAX_MIN_DATE}
              max={today}
              onChange={setEnd}
              invalid={!!problem}
              describedBy={`${ids}-msg`}
              calendarLabel="Abrir calendário da data final"
            />
          </div>
          <button type="submit" className="botao">
            Ver período
          </button>
          <p id={`${ids}-msg`} className={problem ? s.erro : s.dica} aria-live="polite">
            {problem ??
              (source === 'ptax'
                ? 'PTAX disponível desde 04/01/1999, até 10 anos por consulta.'
                : 'Para esta moeda, até 1 ano por consulta.')}
          </p>
        </form>
      )}
    </div>
  )
}
