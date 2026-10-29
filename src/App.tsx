import { useCallback, useEffect, useMemo, useState } from 'react'
import { Masthead } from './components/Masthead'
import { Converter } from './components/converter/Converter'
import { HistorySection } from './components/history/HistorySection'
import { TimeMachine } from './components/timeMachine/TimeMachine'
import { AboutData } from './components/AboutData'
import { SectionBoundary } from './components/SectionBoundary'
import { useResource } from './hooks/useResource'
import { latestCodec, latestKey, loadLatest } from './api/repository'
import { todayInBrazil } from './domain/dates'
import { readState, writeState, type AppState } from './state/urlState'
import type { PeriodSelection } from './domain/periods'
import s from './App.module.css'

const MINUTE = 60_000

/** Relógio de minuto em minuto: mantém "há quanto tempo" e "hoje" corretos com a página aberta. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export default function App() {
  const [state, setState] = useState<AppState>(() => readState(window.location.search))
  const now = useNow()
  const today = todayInBrazil(now)

  const quotes = useResource(latestKey, loadLatest, { maxAgeMs: MINUTE, codec: latestCodec, refreshMs: MINUTE })

  // estado na URL, para compartilhar e voltar ao mesmo ponto
  useEffect(() => {
    const t = setTimeout(() => {
      const next = writeState(state)
      if (next !== window.location.search) window.history.replaceState(null, '', next + window.location.hash)
    }, 400)
    return () => clearTimeout(t)
  }, [state])

  const set = useCallback(<K extends keyof AppState>(key: K, value: AppState[K]) => {
    setState((s) => ({ ...s, [key]: value }))
  }, [])

  const onFrom = useCallback(
    (code: string) => setState((s) => (code === s.to ? { ...s, from: code, to: s.from } : { ...s, from: code })),
    [],
  )
  const onTo = useCallback(
    (code: string) => setState((s) => (code === s.from ? { ...s, to: code, from: s.to } : { ...s, to: code })),
    [],
  )
  const onSwap = useCallback(() => setState((s) => ({ ...s, from: s.to, to: s.from })), [])
  const onPeriod = useCallback((p: PeriodSelection) => set('period', p), [set])
  const onCompare = useCallback((c: string[] | null) => set('compare', c), [set])

  const marketAt = useMemo(() => {
    const book = quotes.data?.book
    if (!book) return null
    const usd = book.USD ?? Object.values(book)[0]
    return usd?.timestamp ?? null
  }, [quotes.data])

  return (
    <>
      <a className={s.pular} href="#conteudo">
        Pular para o conversor
      </a>
      <Masthead marketAt={marketAt} loading={quotes.loading} now={now} />
      <main id="conteudo" className={s.principal}>
        <div className="secao">
          <SectionBoundary name="o conversor">
            <Converter
              from={state.from}
              to={state.to}
              amountText={state.amountText}
              onAmountText={(t) => set('amountText', t)}
              onFrom={onFrom}
              onTo={onTo}
              onSwap={onSwap}
              quotes={quotes}
              now={now}
            />
          </SectionBoundary>
        </div>
        <SectionBoundary name="o histórico">
          <HistorySection
            from={state.from}
            to={state.to}
            today={today}
            now={now}
            book={quotes.data?.book}
            period={state.period}
            onPeriod={onPeriod}
            compare={state.compare}
            onCompare={onCompare}
          />
        </SectionBoundary>
        <SectionBoundary name="a comparação por data">
          <TimeMachine today={today} />
        </SectionBoundary>
        <AboutData />
      </main>
      <footer className={`secao ${s.rodape}`}>
        <p>
          Dados: <a href="https://docs.awesomeapi.com.br/api-de-moedas">AwesomeAPI</a> e{' '}
          <a href="https://dadosabertos.bcb.gov.br/dataset/taxas-de-cambio-todos-os-boletins-diarios">Banco Central do Brasil</a>.
          Ferramenta informativa, sem relação com as fontes.
        </p>
        <p>
          <a href="https://github.com/Davi-cltr/conversor-moedas">Código-fonte no GitHub</a>
        </p>
      </footer>
    </>
  )
}
