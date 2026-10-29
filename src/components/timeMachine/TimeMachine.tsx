import { useId, useMemo, useState } from 'react'
import { getCurrency, PTAX_CODES } from '../../domain/currencies'
import { addDays, addYears, diffDays, formatDate, isIsoDate, type IsoDate } from '../../domain/dates'
import { Big, direction, formatMoney, formatPercent, parseBrazilianNumber } from '../../domain/money'
import { PTAX_MIN_DATE } from '../../domain/periods'
import { pointOnOrBefore, type Point } from '../../domain/series'
import { loadPtaxLegs } from '../../api/repository'
import { DateField } from '../DateField'
import { useResource } from '../../hooks/useResource'
import s from './TimeMachine.module.css'

interface Props {
  today: IsoDate
}

const PRESET_YEARS = [1, 5, 10, 20]
/** Quantos dias antes da data escolhida buscar, para achar o último dia útil com PTAX. */
const LOOKBACK = 14

interface Row {
  code: string
  then: Point
  now: Point
  boughtThen: Big
  boughtNow: Big
  /** Variação do poder de compra do real nessa moeda, em %. */
  change: Big
}

export function TimeMachine({ today }: Props) {
  const ids = useId()
  const [amountText, setAmountText] = useState('1.000')
  const [date, setDate] = useState<IsoDate>(() => addYears(today, -1))
  const [draftDate, setDraftDate] = useState<IsoDate | ''>(date)
  const [draftText, setDraftText] = useState('')

  const amount = parseBrazilianNumber(amountText)
  // enquanto a data está incompleta, nada é apontado como erro
  const dateProblem = !isIsoDate(draftDate)
    ? draftText.length === 10
      ? 'Essa data não existe no calendário.'
      : null
    : draftDate < PTAX_MIN_DATE
      ? 'A PTAX de todas essas moedas está disponível a partir de 04/01/1999.'
      : draftDate > today
        ? 'Escolha uma data até hoje.'
        : null

  const pastRange = useMemo(() => ({ start: addDays(date, -LOOKBACK), end: date }), [date])
  const nowRange = useMemo(() => ({ start: addDays(today, -LOOKBACK), end: today }), [today])

  const past = useResource(`tm:past:${date}`, (signal) => loadPtaxLegs(PTAX_CODES, pastRange, signal), {
    maxAgeMs: 12 * 60 * 60_000,
  })
  const current = useResource(`tm:now:${today}`, (signal) => loadPtaxLegs(PTAX_CODES, nowRange, signal), {
    maxAgeMs: 30 * 60_000,
  })

  const rows: Row[] = useMemo(() => {
    if (!past.data || !current.data || !amount.ok || amount.value.eq(0)) return []
    const out: Row[] = []
    for (const code of PTAX_CODES) {
      const p = past.data[code]
      const c = current.data[code]
      if (!p || !c || p instanceof Error || c instanceof Error) continue
      const then = pointOnOrBefore(p.points, date)
      const now = c.points[c.points.length - 1]
      if (!then || !now) continue
      const boughtThen = amount.value.div(then.value)
      const boughtNow = amount.value.div(now.value)
      out.push({ code, then, now, boughtThen, boughtNow, change: new Big(then.value).div(now.value).minus(1).times(100) })
    }
    return out.sort((a, b) => Number(b.change.minus(a.change)))
  }, [past.data, current.data, amount, date])

  const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(Number(r.change))), 0) || 1
  const losses = rows.filter((r) => r.change.lt(0))
  const gains = rows.filter((r) => r.change.gt(0))
  const thenDate = rows[0]?.then.date
  const nowDate = rows[0]?.now.date
  const loading = (!past.data && past.loading) || (!current.data && current.loading) || (!past.data && !past.error)
  const error = (!past.data && past.error) || (!current.data && current.error)
  const missing = past.data && current.data ? PTAX_CODES.filter((c) => !rows.some((r) => r.code === c)) : []

  function applyDate(next: IsoDate | '', typed = '') {
    setDraftDate(next)
    setDraftText(typed)
    if (isIsoDate(next) && next >= PTAX_MIN_DATE && next <= today) setDate(next)
  }

  return (
    <section className={`secao ${s.secao}`} aria-labelledby={`${ids}-t`} id="outra-data">
      <div className={s.intro}>
        <h2 id={`${ids}-t`} className="titulo-secao">
          Seu real em outra data
        </h2>
        <p className="prosa">
          Escolha um dia no passado e uma quantia em reais. Ao lado de cada moeda aparece quanto esse dinheiro comprava naquele dia e
          quanto compra hoje, pela PTAX do Banco Central.
        </p>
      </div>

      <form className={s.controles} onSubmit={(e) => e.preventDefault()}>
        <div className={s.campo}>
          <label htmlFor={`${ids}-valor`}>Quantia em reais</label>
          <div className={s.valorLinha}>
            <span aria-hidden="true">R$</span>
            <input
              id={`${ids}-valor`}
              inputMode="decimal"
              autoComplete="off"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              aria-invalid={!amount.ok || undefined}
              aria-describedby={`${ids}-valor-msg`}
            />
          </div>
          <p id={`${ids}-valor-msg`} className={s.msg} aria-live="polite">
            {!amount.ok && amount.reason !== 'empty' ? 'Use números com vírgula para os centavos, como 2.500,00.' : ''}
          </p>
        </div>
        <div className={s.campo}>
          <label htmlFor={`${ids}-data`}>Data no passado</label>
          <DateField
            id={`${ids}-data`}
            value={draftDate}
            min={PTAX_MIN_DATE}
            max={today}
            onChange={applyDate}
            invalid={!!dateProblem}
            describedBy={`${ids}-data-msg`}
            calendarLabel="Abrir calendário"
          />
          <p id={`${ids}-data-msg`} className={s.msg} aria-live="polite">
            {dateProblem ?? ''}
          </p>
        </div>
        <div className={s.atalhos}>
          <span className={s.atalhosRotulo} id={`${ids}-atalhos`}>
            Ou volte
          </span>
          <div className={`segmentos ${s.atalhosBotoes}`} role="group" aria-labelledby={`${ids}-atalhos`}>
            {PRESET_YEARS.map((y) => {
              const d = addYears(today, -y)
              return (
                <button key={y} type="button" aria-pressed={date === d} aria-label={`há ${y} ${y === 1 ? 'ano' : 'anos'}`} onClick={() => applyDate(d)}>
                  {y} {y === 1 ? 'ano' : 'anos'}
                </button>
              )
            })}
          </div>
        </div>
      </form>

      {error ? (
        <div className={s.estado} role="alert">
          <p>{(error as Error).message} Sem as cotações oficiais, a comparação não é feita.</p>
          <button
            type="button"
            className="botao"
            onClick={() => {
              past.reload()
              current.reload()
            }}
          >
            Tentar de novo
          </button>
        </div>
      ) : loading || !past.data || !current.data ? (
        <p className={s.estado} role="status">
          Buscando a PTAX de {formatDate(date)} e a mais recente…
        </p>
      ) : !amount.ok || rows.length === 0 ? (
        <p className={s.estado} role="status">
          {amount.ok ? `Não há PTAX publicada até ${LOOKBACK} dias antes de ${formatDate(date)}.` : 'Informe uma quantia para comparar.'}
        </p>
      ) : (
        <div className={s.resultado}>
          <p className={s.manchete}>
            {summarize(rows.length, gains.length, losses.length, formatDate(thenDate!))}
          </p>
          {(gains[0] || losses.at(-1)) && (
            <p className={`prosa ${s.destaque}`}>
              {losses.length > 0 && (
                <>
                  A maior perda foi frente ao <strong>{getCurrency(losses.at(-1)!.code)?.name.toLowerCase()}</strong> (
                  <span className="num">{formatPercent(losses.at(-1)!.change, 1)}</span>).{' '}
                </>
              )}
              {gains.length > 0 && (
                <>
                  O maior ganho foi frente ao <strong>{getCurrency(gains[0].code)?.name.toLowerCase()}</strong> (
                  <span className="num">{formatPercent(gains[0].change, 1)}</span>).
                </>
              )}
            </p>
          )}

          <ul className={s.lista} aria-label={`Poder de compra de ${formatMoney(amount.value, 'BRL')}`}>
            {rows.map((r) => {
              const dir = direction(r.change)
              const width = (Math.abs(Number(r.change)) / maxAbs) * 100
              return (
                <li key={r.code} className={s.linha} data-dir={dir}>
                  <span className={s.moeda}>
                    <strong>{r.code}</strong>
                    <span>{getCurrency(r.code)?.name}</span>
                  </span>
                  <span className={s.valores}>
                    <span className={s.quando}>em {formatDate(r.then.date)}</span>
                    <span className="num">{formatMoney(r.boughtThen, r.code)}</span>
                    <span className={s.quando}>hoje</span>
                    <span className="num">{formatMoney(r.boughtNow, r.code)}</span>
                  </span>
                  <span className={s.barra} aria-hidden="true">
                    <span className={s.eixo} />
                    <span className={s.tinta} style={{ width: `${width / 2}%` }} />
                  </span>
                  <span className={`num ${s.pct} var-${dir}`}>
                    {formatPercent(r.change, 1)}
                    <span className="sr-only">{dir === 'up' ? ', compra mais' : dir === 'down' ? ', compra menos' : ', sem mudança'}</span>
                  </span>
                </li>
              )
            })}
          </ul>

          <p className={s.nota}>
            Calculado com a PTAX de venda de {formatDate(thenDate!)}
            {thenDate !== date && ` (último dia útil com PTAX até ${formatDate(date)})`} e de {formatDate(nowDate!)}
            {diffDays(nowDate!, today) > 0 && ', a mais recente publicada'}. Mostra só o efeito do câmbio: não considera a inflação no
            Brasil nem nos outros países, nem os custos de uma operação real.
            {missing.length > 0 && ` Sem dados para ${missing.join(', ')}.`}
          </p>
        </div>
      )}
    </section>
  )
}

function summarize(total: number, gains: number, losses: number, when: string): string {
  if (losses === total) return `Desde ${when}, o real passou a comprar menos em todas as ${total} moedas.`
  if (gains === total) return `Desde ${when}, o real passou a comprar mais em todas as ${total} moedas.`
  const parts = []
  if (gains) parts.push(`mais em ${gains} ${gains === 1 ? 'moeda' : 'moedas'}`)
  if (losses) parts.push(`menos em ${losses}`)
  return `Desde ${when}, o real passou a comprar ${parts.join(' e ')}${total - gains - losses ? `; nas demais, quase nada mudou` : ''}.`
}
