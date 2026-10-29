import { useCallback, useId, useMemo } from 'react'
import { BASE_CURRENCY, getCurrency, pairHistorySource } from '../../domain/currencies'
import { orientPair, pairTitle } from '../../domain/pair'
import { describeMoment, formatDate, formatTime, type IsoDate } from '../../domain/dates'
import { direction, formatPercent, formatRate, formatSignedRate, percentChange } from '../../domain/money'
import { pairRate, type QuoteBook } from '../../domain/rates'
import { presetWindow, selectionRange, type PeriodSelection } from '../../domain/periods'
import { changeOverDays, computeStats, findGaps, sliceRange, type Change, type Point } from '../../domain/series'
import { historyCodec, historyKey, loadPairHistory } from '../../api/repository'
import { useResource } from '../../hooks/useResource'
import { LineChart } from './LineChart'
import { PeriodPicker } from './PeriodPicker'
import { CompareView } from './CompareView'
import { DataTable } from './DataTable'
import s from './HistorySection.module.css'

interface Props {
  from: string
  to: string
  today: IsoDate
  now: number
  book: QuoteBook | undefined
  period: PeriodSelection
  onPeriod: (p: PeriodSelection) => void
  compare: readonly string[] | null
  onCompare: (codes: string[] | null) => void
}

const HALF_HOUR = 30 * 60_000

export function HistorySection(props: Props) {
  const { from, to } = props
  const ids = useId()
  const pair = orientPair(from, to)

  if (!pair) {
    return (
      <section className={`secao ${s.secao}`} aria-labelledby={`${ids}-t`} id="historico">
        <h2 id={`${ids}-t`} className="titulo-secao">
          Histórico
        </h2>
        <p className="prosa">Escolha duas moedas diferentes no conversor para ver como a cotação entre elas mudou.</p>
      </section>
    )
  }
  return <PairHistory {...props} base={pair.base} quote={pair.quote} key={`${pair.base}${pair.quote}`} />
}

function PairHistory({
  base,
  quote,
  today,
  now,
  book,
  period,
  onPeriod,
  compare,
  onCompare,
}: Props & { base: string; quote: string }) {
  const ids = useId()
  const source = pairHistorySource(base, quote)
  const windowRange = useMemo(() => presetWindow(today), [today])
  const range = selectionRange(period, today)

  const windowRes = useResource(
    historyKey(base, quote, windowRange),
    (signal) => loadPairHistory(base, quote, windowRange, signal),
    { maxAgeMs: HALF_HOUR, codec: historyCodec },
  )
  const customKey = period.kind === 'custom' ? historyKey(base, quote, period.range) : null
  const customRes = useResource(
    customKey,
    (signal) => loadPairHistory(base, quote, range, signal),
    { maxAgeMs: HALF_HOUR, codec: historyCodec },
  )
  const active = period.kind === 'custom' ? customRes : windowRes

  const points: Point[] = useMemo(() => {
    const data = active.data?.points ?? []
    return period.kind === 'custom' ? data : sliceRange(data, range.start, range.end)
  }, [active.data, period.kind, range.start, range.end])

  const stats = useMemo(() => computeStats(points), [points])
  const gaps = useMemo(() => findGaps(points), [points])
  const missingDays = gaps.reduce((n, g) => n + g.missingBusinessDays, 0)

  const overview = useMemo(() => {
    const pts = windowRes.data?.points ?? []
    return [
      { label: 'em 7 dias', change: changeOverDays(pts, 7) },
      { label: 'em 30 dias', change: changeOverDays(pts, 30) },
      { label: 'em 1 ano', change: changeOverDays(pts, 365) },
    ]
  }, [windowRes.data])

  const market = book ? pairRate(base, quote, book) : null
  const marketToday = book && quote === BASE_CURRENCY ? book[base] : undefined

  const baseCur = getCurrency(base)
  const sourceName = source === 'ptax' ? 'PTAX de fechamento do Banco Central (venda)' : 'fechamento comercial diário da AwesomeAPI'

  const describe = useCallback(
    (_i: number, date: IsoDate) => {
      const first = points[0]
      const p = points.find((q) => q.date === date)
      if (!first || !p || p === first) return null
      return `${formatPercent(percentChange(first.value, p.value))} desde ${formatDate(first.date)}`
    },
    [points],
  )

  const title = pairTitle(base, quote)

  return (
    <section className={`secao ${s.secao}`} aria-labelledby={`${ids}-t`} id="historico">
      <header className={s.cabeca}>
        <div className={s.tituloBloco}>
          <h2 id={`${ids}-t`} className="titulo-secao">
            {title}
          </h2>
          <p className={s.fonte}>
            {source === 'ptax' ? (
              <>Cotação de fechamento publicada pelo Banco Central em cada dia útil.</>
            ) : (
              <>
                O Banco Central não publica PTAX para {baseCur?.name.toLowerCase() ?? base}. Este histórico usa o fechamento comercial
                diário da AwesomeAPI.
              </>
            )}
          </p>
        </div>

        <dl className={s.panorama} aria-label="Variações recentes">
          {marketToday && (
            <div>
              <dt>hoje, no mercado</dt>
              <dd className={`num var-${direction(marketToday.pctChange)}`}>{formatPercent(marketToday.pctChange)}</dd>
            </div>
          )}
          {overview.map((o) => (
            <div key={o.label}>
              <dt>{o.label}</dt>
              <dd className={o.change ? `num var-${direction(o.change.pct)}` : 'num'}>
                {o.change ? formatPercent(o.change.pct) : windowRes.loading ? '…' : '—'}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <PeriodPicker value={period} onChange={onPeriod} today={today} source={source} />

      <div className={s.corpo} aria-busy={active.loading || undefined}>
        {active.error && !active.data ? (
          <div className={s.estado} role="alert">
            <p>{active.error.message} O histórico não será desenhado sem dados reais.</p>
            <button type="button" className="botao" onClick={active.reload}>
              Tentar de novo
            </button>
          </div>
        ) : !active.data ? (
          <div className={s.estado} role="status">
            <div className={s.esqueleto} aria-hidden="true" />
            <p>Buscando o histórico na {source === 'ptax' ? 'API PTAX do Banco Central' : 'AwesomeAPI'}…</p>
          </div>
        ) : points.length === 0 ? (
          <div className={s.estado} role="status">
            <p>
              A fonte não publicou cotações entre {formatDate(range.start)} e {formatDate(range.end)}. Escolha um período maior.
            </p>
          </div>
        ) : (
          <>
            {stats && <StatsStrip stats={stats} />}
            {compare ? (
              <CompareView
                codes={compare}
                onCodes={onCompare}
                base={base}
                range={period.kind === 'custom' ? period.range : range}
                windowRange={period.kind === 'custom' ? null : windowRange}
                today={today}
              />
            ) : (
              <LineChart
                series={[{ id: base, label: base, color: 'var(--gravura)', points }]}
                formatValue={(v) => formatRate(v)}
                describe={describe}
                showExtremes
                ariaLabel={`${title}, de ${formatDate(points[0].date, 'long')} a ${formatDate(points[points.length - 1].date, 'long')}`}
                resetKey={`${base}${quote}${range.start}${range.end}`}
              />
            )}
            <div className={s.notas}>
              <p>
                {points.length} {points.length === 1 ? 'cotação' : 'cotações'} de {formatDate(points[0].date)} a{' '}
                {formatDate(points[points.length - 1].date)}. Fonte: {sourceName}
                {quote !== BASE_CURRENCY && ', com taxa cruzada calculada pelo real'}.
                {missingDays > 0 &&
                  ` A fonte não publicou cotação em ${missingDays} ${missingDays === 1 ? 'dia útil' : 'dias úteis'} do período (feriados ou dados ausentes); esses trechos aparecem pontilhados e nada foi preenchido.`}
                {active.loading && ' Atualizando…'}
              </p>
              {active.error && active.data && (
                <p className={s.alerta}>
                  A atualização falhou; mostrando dados obtidos {describeMoment(active.savedAt ?? 0, now)}.{' '}
                  <button type="button" className="botao-texto" onClick={active.reload}>
                    Tentar de novo
                  </button>
                </p>
              )}
            </div>
            {!compare && (
              <LatestVsMarket
                last={points[points.length - 1]}
                publishedAt={active.data.lastPublishedAt}
                source={source}
                market={market ? { rate: market.rate.toString(), timestamp: market.timestamp } : null}
                now={now}
                quote={quote}
                isLatestPeriod={range.end >= today}
              />
            )}
            <div className={s.acoes}>
              <button
                type="button"
                className="botao"
                aria-pressed={!!compare}
                onClick={() => onCompare(compare ? null : defaultCompare(base))}
              >
                {compare ? 'Voltar ao gráfico do par' : 'Comparar com outras moedas'}
              </button>
              {!compare && <DataTable points={points} label={title} />}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function defaultCompare(base: string): string[] {
  const picks = ['USD', 'EUR', 'GBP', 'JPY']
  const isPtax = getCurrency(base)?.history === 'ptax'
  return isPtax ? [base, ...picks.filter((c) => c !== base)].slice(0, 4) : picks
}

function StatsStrip({ stats }: { stats: NonNullable<ReturnType<typeof computeStats>> }) {
  const dir = direction(stats.absChange)
  return (
    <dl className={s.indicadores}>
      <div>
        <dt>Início</dt>
        <dd className="num">{formatRate(stats.first.value)}</dd>
        <dd className={s.quando}>{formatDate(stats.first.date)}</dd>
      </div>
      <div>
        <dt>Fim</dt>
        <dd className="num">{formatRate(stats.last.value)}</dd>
        <dd className={s.quando}>{formatDate(stats.last.date)}</dd>
      </div>
      <div>
        <dt>Máxima</dt>
        <dd className="num">{formatRate(stats.max.value)}</dd>
        <dd className={s.quando}>{formatDate(stats.max.date)}</dd>
      </div>
      <div>
        <dt>Mínima</dt>
        <dd className="num">{formatRate(stats.min.value)}</dd>
        <dd className={s.quando}>{formatDate(stats.min.date)}</dd>
      </div>
      <div className={s.variacao}>
        <dt>Variação no período</dt>
        <dd className={`num var-${dir}`}>{formatPercent(stats.pctChange)}</dd>
        <dd className={s.quando}>
          <span className="num">{formatSignedRate(stats.absChange, Math.max(4, decimalsOf(stats.first.value)))}</span> em valor
        </dd>
      </div>
    </dl>
  )
}

function decimalsOf(v: number) {
  const t = formatRate(v)
  const i = t.indexOf(',')
  return i < 0 ? 0 : t.length - i - 1
}

function LatestVsMarket(props: {
  last: Point
  publishedAt: number | null
  source: 'ptax' | 'awesome'
  market: { rate: string; timestamp: number } | null
  now: number
  quote: string
  isLatestPeriod: boolean
}) {
  const { last, publishedAt, source, market, now, isLatestPeriod } = props
  if (!isLatestPeriod) return null
  const diff: Change['pct'] | null = market ? percentChange(last.value, market.rate) : null
  return (
    <aside className={s.versus} aria-label="Última cotação do histórico e cotação comercial de agora">
      <div>
        <p className={s.versusRotulo}>{source === 'ptax' ? 'Última PTAX publicada' : 'Último fechamento do histórico'}</p>
        <p className={`num ${s.versusValor}`}>{formatRate(last.value)}</p>
        <p className={s.versusQuando}>
          {formatDate(last.date, 'weekday')}
          {publishedAt ? `, boletim das ${formatTime(publishedAt)}` : ''}
        </p>
      </div>
      {market && (
        <div>
          <p className={s.versusRotulo}>Cotação comercial agora</p>
          <p className={`num ${s.versusValor}`}>{formatRate(market.rate)}</p>
          <p className={s.versusQuando}>
            {describeMoment(market.timestamp, now)}
            {diff && <>, {formatPercent(diff)} em relação ao histórico</>}
          </p>
        </div>
      )}
      <p className={`prosa ${s.versusTexto}`}>
        {source === 'ptax'
          ? 'A PTAX é uma taxa de referência oficial: o Banco Central consulta o mercado em quatro janelas entre 10h e 13h e publica a média uma vez por dia útil. A cotação comercial muda a cada minuto. As duas medem coisas diferentes e não precisam coincidir.'
          : 'O histórico registra um valor por dia; a cotação comercial muda a cada minuto. Por isso as duas não precisam coincidir.'}
      </p>
    </aside>
  )
}
