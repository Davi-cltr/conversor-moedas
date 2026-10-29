import { useMemo } from 'react'
import { getCurrency, PTAX_CODES } from '../../domain/currencies'
import { formatDate, type IsoDate } from '../../domain/dates'
import { direction, formatPercent } from '../../domain/money'
import type { DateRange } from '../../domain/periods'
import { rebaseToPercent, sliceRange, type Point } from '../../domain/series'
import { loadPtaxLegs } from '../../api/repository'
import { useResource } from '../../hooks/useResource'
import { LineChart, type ChartSeries } from './LineChart'
import s from './CompareView.module.css'

const COLORS = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)', 'var(--serie-4)', 'var(--serie-5)']
export const MAX_COMPARE = 5

interface Props {
  codes: readonly string[]
  onCodes: (codes: string[]) => void
  base: string
  /** Intervalo exibido. */
  range: DateRange
  /** Janela já buscada para os presets (reaproveitada); null para período personalizado. */
  windowRange: DateRange | null
  today: IsoDate
}

/**
 * Comparação entre moedas com escalas muito diferentes (o iene vale
 * centavos, a libra mais de sete reais): cada linha mostra a variação
 * percentual de 1 unidade da moeda, em reais, desde o primeiro dia comum do período.
 */
export function CompareView({ codes, onCodes, base, range, windowRange }: Props) {
  const valid = useMemo(() => codes.filter((c) => PTAX_CODES.includes(c)), [codes])
  const fetchRange = windowRange ?? range
  const key = valid.length ? `compare:${[...valid].sort().join(',')}:${fetchRange.start}:${fetchRange.end}` : null

  const res = useResource(key, (signal) => loadPtaxLegs(valid, fetchRange, signal), { maxAgeMs: 30 * 60_000 })

  const series: ChartSeries[] = useMemo(() => {
    if (!res.data) return []
    // todas as linhas começam na primeira data em que todas as moedas têm cotação
    const sliced = valid
      .map((code) => {
        const leg = res.data![code]
        return { code, pts: leg && !(leg instanceof Error) ? sliceRange(leg.points, range.start, range.end) : [] }
      })
      .filter((x) => x.pts.length > 1)
    if (!sliced.length) return []
    const commonStart = sliced.map((x) => x.pts[0].date).sort().at(-1)!
    return sliced.map((x) => ({
      id: x.code,
      label: x.code,
      color: COLORS[valid.indexOf(x.code) % COLORS.length],
      points: rebaseToPercent(x.pts.filter((p: Point) => p.date >= commonStart)),
    }))
  }, [res.data, valid, range.start, range.end])

  const failed = res.data ? valid.filter((c) => res.data![c] instanceof Error) : []

  // as séries já estão em % desde o início comum: o último ponto é a variação do período
  const ranking = useMemo(
    () =>
      series
        .filter((sr) => sr.points.length > 0)
        .map((sr) => ({ sr, pct: sr.points[sr.points.length - 1].value }))
        .sort((a, b) => b.pct - a.pct),
    [series],
  )

  function toggle(code: string) {
    if (codes.includes(code)) {
      if (codes.length > 1) onCodes(codes.filter((c) => c !== code))
    } else if (codes.length < MAX_COMPARE) onCodes([...codes, code])
  }

  const baseOutside = !PTAX_CODES.includes(base)
  const start = series[0]?.points[0]?.date

  return (
    <div className={s.wrap}>
      <fieldset className={s.escolha}>
        <legend>
          Moedas comparadas <span className={s.limite}>(até {MAX_COMPARE})</span>
        </legend>
        <div className={s.fichas}>
          {PTAX_CODES.map((code) => {
            const on = codes.includes(code)
            const idx = valid.indexOf(code)
            return (
              <button
                key={code}
                type="button"
                className={s.ficha}
                aria-pressed={on}
                disabled={!on && codes.length >= MAX_COMPARE}
                onClick={() => toggle(code)}
                title={getCurrency(code)?.name}
              >
                {on && <span className={s.amostra} style={{ background: COLORS[idx % COLORS.length] }} aria-hidden="true" />}
                {code}
                <span className="sr-only">{getCurrency(code)?.name}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <p className={`prosa ${s.explica}`}>
        Como essas moedas valem quantias muito diferentes em reais, o gráfico não compara preços: cada linha mostra quanto 1 unidade
        da moeda ficou mais cara (acima de 0%) ou mais barata (abaixo) em reais desde {start ? formatDate(start) : 'o início do período'}.
        {baseOutside && ` ${base} não aparece porque a comparação usa só a PTAX do Banco Central.`}
      </p>

      {res.error && !res.data ? (
        <div className={s.estado} role="alert">
          <p>{res.error.message}</p>
          <button type="button" className="botao" onClick={res.reload}>
            Tentar de novo
          </button>
        </div>
      ) : !res.data ? (
        <p className={s.estado} role="status">
          Buscando a PTAX de {valid.join(', ')}…
        </p>
      ) : series.length === 0 ? (
        <p className={s.estado} role="status">
          Não há cotações suficientes para comparar neste período.
        </p>
      ) : (
        <>
          <LineChart
            series={series}
            formatValue={(v) => formatPercent(v)}
            baseline={0}
            axisSuffix="%"
            ariaLabel={`Variação percentual em reais desde ${start ? formatDate(start, 'long') : ''}: ${series.map((x) => x.label).join(', ')}`}
            resetKey={`${series.map((x) => x.id).join()}${range.start}${range.end}`}
          />
          <ol className={s.ranking} aria-label="Variação no período, da maior para a menor">
            {ranking.map(({ sr, pct }) => (
              <li key={sr.id}>
                <span className={s.amostra} style={{ background: sr.color }} aria-hidden="true" />
                <span className={s.rankNome}>
                  <strong>{sr.id}</strong> {getCurrency(sr.id)?.name}
                </span>
                <span className={`num var-${direction(pct)}`}>{formatPercent(pct)}</span>
              </li>
            ))}
          </ol>
          {failed.length > 0 && (
            <p className={s.estado} role="status">
              Não foi possível obter a PTAX de {failed.join(', ')} agora.
            </p>
          )}
        </>
      )}
    </div>
  )
}
