import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { addDays, diffDays, formatDate, type IsoDate } from '../../domain/dates'
import { downsampleMinMax, findGaps, nearestIndex, niceTicks, type Point } from '../../domain/series'
import s from './LineChart.module.css'

export interface ChartSeries {
  id: string
  label: string
  /** Variável CSS ou cor. */
  color: string
  points: readonly Point[]
}

interface Props {
  series: readonly ChartSeries[]
  /** Formata valores do eixo e da leitura. */
  formatValue: (v: number) => string
  /** Texto para a leitura do ponto selecionado (ex.: variação desde o início). */
  describe?: (index: number, date: IsoDate) => string | null
  /** Marca máxima e mínima (só faz sentido com uma série). */
  showExtremes?: boolean
  /** Linha de referência horizontal (ex.: 0% na comparação). */
  baseline?: number
  /** Sufixo das marcas do eixo de valores (ex.: "%"). */
  axisSuffix?: string
  ariaLabel: string
  /** Muda quando os dados mudam de natureza (outro par/período): reinicia a seleção. */
  resetKey: string
}

const M = { top: 18, right: 64, bottom: 30, left: 6 }
const NO_POINTS: readonly Point[] = []

function dateMs(d: IsoDate) {
  return Date.parse(`${d}T00:00:00Z`)
}

function addMonths(d: IsoDate, n: number): IsoDate {
  const [y, m] = d.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  return t.toISOString().slice(0, 10)
}

/** Marcas de data adequadas ao intervalo e à largura disponível. */
function dateTicks(start: IsoDate, end: IsoDate, maxTicks: number): { date: IsoDate; label: string }[] {
  const span = Math.max(1, diffDays(start, end))
  const out: { date: IsoDate; label: string }[] = []
  if (span <= 45) {
    const step = [1, 2, 3, 7, 14].find((st) => span / st <= maxTicks) ?? 14
    for (let d = start; d <= end; d = addDays(d, step)) out.push({ date: d, label: formatDate(d, 'axis-day') })
    return out
  }
  if (span <= 800) {
    const step = [1, 2, 3, 6].find((st) => span / 30 / st <= maxTicks) ?? 6
    for (let d = addMonths(start, 1); d <= end; d = addMonths(d, step)) out.push({ date: d, label: formatDate(d, 'axis-month') })
    return out
  }
  const years = span / 365
  const step = [1, 2, 5, 10].find((st) => years / st <= maxTicks) ?? 10
  const y0 = Number(start.slice(0, 4)) + 1
  for (let y = Math.ceil(y0 / step) * step; `${y}-01-01` <= end; y += step) out.push({ date: `${y}-01-01`, label: String(y) })
  return out
}

export function LineChart({ series, formatValue, describe, showExtremes, baseline, axisSuffix = '', ariaLabel, resetKey }: Props) {
  const ids = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [announce, setAnnounce] = useState('')

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width)
      setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // novo par ou período: a seleção anterior deixa de fazer sentido
  const [lastReset, setLastReset] = useState(resetKey)
  if (lastReset !== resetKey) {
    setLastReset(resetKey)
    setSelected(null)
  }

  const height = width < 520 ? 250 : 340
  const innerW = Math.max(0, width - M.left - M.right)
  const innerH = height - M.top - M.bottom

  const primary = useMemo(() => series[0]?.points ?? NO_POINTS, [series])
  // eixo de datas: todas as datas presentes em alguma série
  const axisDates = useMemo(() => {
    if (series.length === 1) return primary.map((p) => p.date)
    const set = new Set<IsoDate>()
    for (const sr of series) for (const p of sr.points) set.add(p.date)
    return [...set].sort()
  }, [series, primary])

  const axisPoints = useMemo(() => axisDates.map((date) => ({ date, value: 0 })), [axisDates])

  const geometry = useMemo(() => {
    if (!axisDates.length || innerW <= 0) return null
    const x0 = dateMs(axisDates[0])
    const x1 = dateMs(axisDates[axisDates.length - 1])
    let lo = Infinity
    let hi = -Infinity
    for (const sr of series)
      for (const p of sr.points) {
        if (p.value < lo) lo = p.value
        if (p.value > hi) hi = p.value
      }
    if (baseline !== undefined) {
      lo = Math.min(lo, baseline)
      hi = Math.max(hi, baseline)
    }
    const pad = (hi - lo || Math.abs(hi) * 0.02 || 1) * 0.1
    const yTicks = niceTicks(lo - pad, hi + pad, innerH < 220 ? 4 : 5)
    const yMin = Math.min(lo - pad, yTicks[0] ?? lo)
    const yMax = Math.max(hi + pad, yTicks[yTicks.length - 1] ?? hi)
    const sx = (d: IsoDate) => (x1 === x0 ? innerW / 2 : ((dateMs(d) - x0) / (x1 - x0)) * innerW)
    const sy = (v: number) => innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH
    return { sx, sy, yTicks: yTicks.filter((t) => t >= yMin && t <= yMax), x0, x1 }
  }, [axisDates, series, innerW, innerH, baseline])

  // o eixo mostra só as casas que o passo entre marcas exige (5,1 e não 5,1000)
  const axisFormat = useMemo(() => {
    const t = geometry?.yTicks ?? []
    const step = t.length > 1 ? Math.abs(t[1] - t[0]) : 1
    const decimals = Math.min(8, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)))
    const nf = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    return (v: number) => `${nf.format(v)}${axisSuffix}`
  }, [geometry, axisSuffix])

  const drawn = useMemo(() => {
    if (!geometry) return []
    const { sx, sy } = geometry
    return series.map((sr) => {
      const pts = downsampleMinMax(sr.points, Math.max(40, Math.floor(innerW / 1.5)))
      // segmentos contínuos; onde faltam dias úteis o traço vira pontilhado
      const gaps = new Set(findGaps(sr.points).map((g) => g.after))
      let solid = ''
      let dashed = ''
      pts.forEach((p, i) => {
        const cmd = `${sx(p.date).toFixed(1)},${sy(p.value).toFixed(1)}`
        if (i === 0) {
          solid += `M${cmd}`
          return
        }
        const prev = pts[i - 1]
        if (gaps.has(prev.date) && sr.points.length === pts.length) {
          dashed += `M${sx(prev.date).toFixed(1)},${sy(prev.value).toFixed(1)}L${cmd}`
          solid += `M${cmd}`
        } else solid += `L${cmd}`
      })
      const area =
        pts.length > 1
          ? `M${sx(pts[0].date).toFixed(1)},${innerH}` +
            pts.map((p) => `L${sx(p.date).toFixed(1)},${sy(p.value).toFixed(1)}`).join('') +
            `L${sx(pts[pts.length - 1].date).toFixed(1)},${innerH}Z`
          : ''
      return { ...sr, solid, dashed, area }
    })
  }, [geometry, series, innerW, innerH])

  const extremes = useMemo(() => {
    if (!showExtremes || primary.length < 3) return null
    let max = primary[0]
    let min = primary[0]
    for (const p of primary) {
      if (p.value > max.value) max = p
      if (p.value < min.value) min = p
    }
    return { max, min }
  }, [showExtremes, primary])

  const xTicks = useMemo(
    () =>
      axisDates.length && innerW > 0
        ? dateTicks(axisDates[0], axisDates[axisDates.length - 1], Math.max(2, Math.floor(innerW / 78)))
        : [],
    [axisDates, innerW],
  )

  const selDate = selected !== null ? axisDates[selected] : null

  const readoutFor = useCallback(
    (idx: number) => {
      const date = axisDates[idx]
      const vals = series
        .map((sr) => {
          const p = sr.points.find((q) => q.date === date)
          return p ? `${sr.label} ${formatValue(p.value)}` : null
        })
        .filter(Boolean)
        .join(', ')
      const extra = describe?.(idx, date)
      return `${formatDate(date, 'long')}: ${vals}${extra ? `. ${extra}` : ''}`
    },
    [axisDates, series, formatValue, describe],
  )

  function selectAt(clientX: number) {
    if (!geometry || !wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const x = clientX - rect.left - M.left
    const t = geometry.x0 + (Math.min(Math.max(x, 0), innerW) / (innerW || 1)) * (geometry.x1 - geometry.x0)
    const date = new Date(t).toISOString().slice(0, 10)
    const idx = nearestIndex(axisPoints, date)
    if (idx >= 0 && idx !== selected) setSelected(idx)
  }

  function onPointerMove(e: PointerEvent) {
    selectAt(e.clientX)
  }

  function onPointerLeave(e: PointerEvent) {
    // no toque a leitura fica fixa; com mouse ela some ao sair
    if (e.pointerType === 'mouse') setSelected(null)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!axisDates.length) return
    const last = axisDates.length - 1
    const cur = selected ?? last
    let next: number | null = cur
    const big = Math.max(1, Math.round(axisDates.length / 10))
    switch (e.key) {
      case 'ArrowLeft':
        next = Math.max(0, cur - 1)
        break
      case 'ArrowRight':
        next = Math.min(last, cur + 1)
        break
      case 'PageUp':
        next = Math.max(0, cur - big)
        break
      case 'PageDown':
        next = Math.min(last, cur + big)
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = last
        break
      case 'Escape':
        next = null
        break
      default:
        return
    }
    e.preventDefault()
    setSelected(next)
    setAnnounce(next === null ? 'Seleção removida' : readoutFor(next))
  }

  if (!primary.length && series.every((sr) => !sr.points.length)) return null

  const focusIdx = selected ?? axisDates.length - 1
  const focusDate = axisDates[focusIdx]

  return (
    <figure className={s.figura}>
      <div className={s.leitura} aria-hidden="true">
        <span className={s.leituraData}>{focusDate ? formatDate(focusDate, 'long') : ''}</span>
        <span className={s.leituraValores}>
          {series.map((sr) => {
            const p = sr.points.find((q) => q.date === focusDate)
            return (
              <span key={sr.id} className={s.leituraItem}>
                {series.length > 1 && <span className={s.amostra} style={{ background: sr.color }} />}
                {series.length > 1 && <span className={s.leituraRotulo}>{sr.label}</span>}
                <span className="num">{p ? formatValue(p.value) : 'sem dado'}</span>
              </span>
            )
          })}
        </span>
        {describe && focusDate && <span className={s.leituraExtra}>{describe(focusIdx, focusDate)}</span>}
        {selected === null && <span className={s.dica}>Toque ou passe o cursor no gráfico para ver outro dia.</span>}
      </div>

      <div
        ref={wrapRef}
        className={s.area}
        style={{ height }}
        tabIndex={0}
        role="group"
        aria-roledescription="gráfico"
        aria-label={`${ariaLabel}. Use as setas para percorrer os dias.`}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
        onBlur={() => setAnnounce('')}
      >
        {geometry && width > 0 && (
          <svg width={width} height={height} className={s.svg} aria-hidden="true">
            <defs>
              <pattern id={`${ids}-hachura`} width="4" height="4" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0.5" x2="4" y2="0.5" stroke="var(--gravura)" strokeWidth="0.8" />
              </pattern>
              <linearGradient id={`${ids}-desvanece`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0.7" />
                <stop offset="1" stopColor="#fff" stopOpacity="0.04" />
              </linearGradient>
              <mask id={`${ids}-mascara`}>
                <rect x="0" y="0" width={innerW} height={innerH} fill={`url(#${ids}-desvanece)`} />
              </mask>
              <clipPath id={`${ids}-recorte`}>
                <rect x="-2" y="-8" width={innerW + 4} height={innerH + 10} />
              </clipPath>
            </defs>

            <g transform={`translate(${M.left},${M.top})`}>
              {/* grade horizontal e eixo de valores à direita */}
              {geometry.yTicks.map((t) => (
                <g key={t} transform={`translate(0,${geometry.sy(t).toFixed(1)})`}>
                  <line x1="0" x2={innerW} className={baseline === t ? s.base : s.grade} />
                  <text x={innerW + 8} dy="0.32em" className={s.eixo}>
                    {axisFormat(t)}
                  </text>
                </g>
              ))}
              {baseline !== undefined && !geometry.yTicks.includes(baseline) && (
                <line x1="0" x2={innerW} y1={geometry.sy(baseline)} y2={geometry.sy(baseline)} className={s.base} />
              )}

              {/* eixo de datas */}
              {xTicks.map((t) => {
                const x = geometry.sx(t.date)
                if (x < 0 || x > innerW) return null
                // rótulos nas pontas encostam na borda em vez de vazar para fora do gráfico
                const anchor = x < 28 ? 'start' : x > innerW - 28 ? 'end' : 'middle'
                return (
                  <g key={t.date} transform={`translate(${x.toFixed(1)},${innerH})`}>
                    <line y1="0" y2="5" className={s.marca} />
                    <text y="20" textAnchor={anchor} className={s.eixo}>
                      {t.label}
                    </text>
                  </g>
                )
              })}

              <g clipPath={`url(#${ids}-recorte)`}>
                {series.length === 1 && drawn[0]?.area && (
                  <path d={drawn[0].area} fill={`url(#${ids}-hachura)`} mask={`url(#${ids}-mascara)`} />
                )}
                {drawn.map((d) => (
                  <g key={d.id} style={{ color: d.color }}>
                    {d.dashed && <path d={d.dashed} className={s.lacuna} />}
                    <path d={d.solid} className={s.linha} />
                  </g>
                ))}
              </g>

              {extremes && (
                <>
                  <Extreme x={geometry.sx(extremes.max.date)} y={geometry.sy(extremes.max.value)} label={`máx. ${formatValue(extremes.max.value)}`} up innerW={innerW} />
                  <Extreme x={geometry.sx(extremes.min.date)} y={geometry.sy(extremes.min.value)} label={`mín. ${formatValue(extremes.min.value)}`} innerW={innerW} innerH={innerH} />
                </>
              )}

              {/* fim da série: ponto e valor */}
              {series.map((sr) => {
                const last = sr.points[sr.points.length - 1]
                if (!last) return null
                return (
                  <circle key={sr.id} cx={geometry.sx(last.date)} cy={geometry.sy(last.value)} r="3.5" className={s.fim} style={{ color: sr.color }} />
                )
              })}

              {selDate && (
                <g transform={`translate(${geometry.sx(selDate).toFixed(1)},0)`}>
                  <line y1="-6" y2={innerH} className={s.cursor} />
                  {series.map((sr) => {
                    const p = sr.points.find((q) => q.date === selDate)
                    return p ? <circle key={sr.id} cy={geometry.sy(p.value)} r="5" className={s.selecao} style={{ color: sr.color }} /> : null
                  })}
                </g>
              )}
            </g>
          </svg>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </figure>
  )
}

function Extreme({ x, y, label, up, innerW, innerH = 0 }: { x: number; y: number; label: string; up?: boolean; innerW: number; innerH?: number }) {
  const anchor = x < 60 ? 'start' : x > innerW - 60 ? 'end' : 'middle'
  const ty = up ? Math.max(-6, y - 10) : Math.min(innerH + 0 - 4, y + 18)
  return (
    <g>
      <circle cx={x} cy={y} r="2.5" className={s.extremo} />
      <text x={x} y={ty} textAnchor={anchor} className={s.extremoTexto}>
        {label}
      </text>
    </g>
  )
}
