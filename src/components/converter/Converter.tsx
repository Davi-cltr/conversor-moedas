import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import { getCurrency } from '../../domain/currencies'
import { describeMoment } from '../../domain/dates'
import {
  Big,
  convert,
  distinctDecimals,
  formatMoney,
  formatPlain,
  formatRate,
  MAX_FRACTION_DIGITS,
  parseBrazilianNumber,
  type ParseResult,
} from '../../domain/money'
import { pairRate, type PairRate } from '../../domain/rates'
import type { LatestQuotes } from '../../api/awesome'
import type { ResourceState } from '../../hooks/useResource'
import { ApiError } from '../../api/http'
import { CurrencyPicker } from './CurrencyPicker'
import { CostSimulator } from './CostSimulator'
import { Guilloche } from './Guilloche'
import s from './Converter.module.css'

interface Props {
  from: string
  to: string
  amountText: string
  onAmountText: (text: string) => void
  onFrom: (code: string) => void
  onTo: (code: string) => void
  onSwap: () => void
  quotes: ResourceState<LatestQuotes> & { reload: () => void }
  now: number
}

const PARSE_MESSAGE: Record<Exclude<ParseResult, { ok: true }>['reason'], string> = {
  empty: 'Digite um valor para converter.',
  invalid: 'Use números com vírgula para os centavos, como 1.234,56.',
  negative: 'O valor precisa ser positivo.',
  'too-large': 'Esse valor é grande demais. Use até 13 dígitos antes da vírgula.',
  'too-many-decimals': `Use no máximo ${MAX_FRACTION_DIGITS} casas depois da vírgula.`,
}

/**
 * O número da cédula encolhe conforme o comprimento, para nunca ser cortado.
 * A conta usa a largura do lado (container query) e o número de caracteres.
 */
function fit(text: string): CSSProperties {
  return { '--len': Math.max(3, text.length) } as CSSProperties
}

/** A partir de quanto tempo a cotação é apresentada como "última disponível", e não "de agora". */
const STALE_AFTER_MS = 30 * 60_000

export function Converter(props: Props) {
  const { from, to, amountText, onAmountText, onFrom, onTo, onSwap, quotes, now } = props
  const ids = useId()
  const [rotation, setRotation] = useState(0)
  const [focused, setFocused] = useState(false)

  const parsed = useMemo(() => parseBrazilianNumber(amountText), [amountText])
  const book = quotes.data?.book
  const rate: PairRate | null = useMemo(() => (book ? pairRate(from, to, book) : null), [book, from, to])
  const result = parsed.ok && rate ? convert(parsed.value, rate.rate) : null

  const fromCur = getCurrency(from)
  const toCur = getCurrency(to)
  const missing = quotes.data?.missing ?? []
  const pairMissing = !!book && !rate

  // anúncio para leitores de tela só depois que a pessoa para de digitar
  const [announcement, setAnnouncement] = useState('')
  const announceText = result && parsed.ok ? `${formatMoney(parsed.value, from)} equivalem a ${formatMoney(result, to)}` : ''
  useEffect(() => {
    if (!announceText) return
    const t = setTimeout(() => setAnnouncement(announceText), 700)
    return () => clearTimeout(t)
  }, [announceText])

  // destaca a taxa por um instante quando uma atualização a altera
  const lastRate = useRef<string | null>(null)
  const [pulse, setPulse] = useState(0)
  const rateKey = rate ? `${from}${to}${rate.rate.toString()}` : null
  useEffect(() => {
    if (rateKey && lastRate.current && lastRate.current !== rateKey && lastRate.current.startsWith(`${from}${to}`)) {
      setPulse((p) => p + 1)
    }
    lastRate.current = rateKey
  }, [rateKey, from, to])

  function swap() {
    setRotation((r) => r + 180)
    onSwap()
  }

  function normalizeOnBlur() {
    setFocused(false)
    if (parsed.ok) onAmountText(formatPlain(parsed.value, MAX_FRACTION_DIGITS))
  }

  const bidAskDecimals = rate?.bidAsk ? distinctDecimals(rate.bidAsk.bid, rate.bidAsk.ask) : undefined
  const resultShown = result ? formatMoney(result, to, { withSymbol: false }) : ''
  const stale = rate ? now - rate.timestamp > STALE_AFTER_MS : false
  const showError = !parsed.ok && parsed.reason !== 'empty'
  const hint = parsed.ok && parsed.dotAsDecimal && !focused ? `Entendido como ${formatPlain(parsed.value, MAX_FRACTION_DIGITS)}.` : null
  const firstLoad = !quotes.data && quotes.loading
  const failedWithoutData = !quotes.data && !!quotes.error

  return (
    <section className={s.wrap} aria-labelledby={`${ids}-titulo`}>
      <h2 id={`${ids}-titulo`} className="sr-only">
        Conversor
      </h2>

      <div className={s.cedula}>
        <svg className={s.faixa} aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 400 12">
          <defs>
            <pattern id={`${ids}-onda`} width="16" height="12" patternUnits="userSpaceOnUse">
              <path d="M0 6 Q4 0 8 6 T16 6" fill="none" stroke="currentColor" strokeWidth="0.6" />
              <path d="M0 6 Q4 12 8 6 T16 6" fill="none" stroke="currentColor" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="400" height="12" fill={`url(#${ids}-onda)`} />
        </svg>

        <Guilloche className={s.selo} from={from} to={to} rotation={rotation} />

        <div className={s.campos}>
          <div className={s.lado}>
            <div className={s.topoLado}>
              <label className={s.rotulo} htmlFor={`${ids}-valor`}>
                Você converte
              </label>
              <CurrencyPicker value={from} onChange={onFrom} label="Moeda de origem" otherSide={to} unavailable={missing} />
            </div>
            <input
              id={`${ids}-valor`}
              className={s.valor}
              style={fit(amountText || '0,00')}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={amountText}
              placeholder="0,00"
              aria-invalid={showError || undefined}
              aria-describedby={`${ids}-ajuda`}
              onChange={(e) => onAmountText(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={normalizeOnBlur}
            />
            <p id={`${ids}-ajuda`} className={showError ? s.erro : s.nome} aria-live={showError ? 'polite' : undefined}>
              {showError ? PARSE_MESSAGE[(parsed as { reason: keyof typeof PARSE_MESSAGE }).reason] : hint ?? fromCur?.name}
            </p>
          </div>

          <button
            type="button"
            className={s.inverter}
            onClick={swap}
            aria-label={`Inverter: converter de ${to} para ${from}`}
            title="Inverter moedas"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 7h11l-3.5-3.5M17 17H6l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className={s.lado}>
            <div className={s.topoLado}>
              <span className={s.rotulo} id={`${ids}-rec`}>
                Você recebe
              </span>
              <CurrencyPicker value={to} onChange={onTo} label="Moeda de destino" otherSide={from} unavailable={missing} />
            </div>
            <output
              className={s.resultado}
              style={fit(resultShown || '—')}
              aria-labelledby={`${ids}-rec`}
              htmlFor={`${ids}-valor`}
              data-state={result ? 'ok' : 'vazio'}
            >
              {result ? (
                resultShown
              ) : firstLoad ? (
                <span className={s.carregando}>buscando cotação</span>
              ) : (
                <span className={s.vazio}>—</span>
              )}
            </output>
            <p className={s.nome}>{toCur?.name}</p>
          </div>
        </div>

        <div className={s.rodape}>
          {rate ? (
            <>
              <p className={s.taxa}>
                <span className="num" key={pulse} data-pulse={pulse > 0 || undefined}>
                  1 {from} = {formatRate(rate.rate)} {to}
                </span>
                <span className={s.inversa}>
                  1 {to} = {formatRate(new Big(1).div(rate.rate))} {from}
                </span>
              </p>
              {rate.bidAsk && (
                <p className={s.compraVenda}>
                  <span>
                    Compra <span className="num">{formatRate(rate.bidAsk.bid, bidAskDecimals)}</span>
                  </span>
                  <span>
                    Venda <span className="num">{formatRate(rate.bidAsk.ask, bidAskDecimals)}</span>
                  </span>
                  <span className={s.legenda}>reais por 1 {rate.bidAsk.quotedCode}</span>
                </p>
              )}
              <p className={s.origem}>
                {stale ? 'Última cotação comercial disponível' : 'Cotação comercial'}, {describeMoment(rate.timestamp, now)}
                {rate.isCross && '. Taxa cruzada calculada através do real'}
                {quotes.fromCache && quotes.loading && '. Conferindo atualização…'}
              </p>
            </>
          ) : failedWithoutData ? (
            <div className={s.falha} role="alert">
              <p>
                {quotes.error instanceof ApiError ? quotes.error.message : 'Não foi possível obter as cotações.'} A conversão
                precisa de uma cotação real e não será estimada.
              </p>
              <button type="button" className="botao" onClick={quotes.reload}>
                Tentar de novo
              </button>
            </div>
          ) : pairMissing ? (
            <p className={s.origem} role="status">
              A fonte não enviou cotação para {[from, to].filter((c) => missing.includes(c)).join(' e ')} agora. Escolha outra moeda ou tente
              mais tarde.
            </p>
          ) : (
            <p className={s.origem} role="status">
              Buscando a cotação mais recente…
            </p>
          )}
          {quotes.data && quotes.error && (
            <p className={s.aviso} role="status">
              A atualização falhou ({quotes.error.message.replace(/\.$/, '')}). Mostrando a cotação obtida {describeMoment(quotes.savedAt ?? 0, now)}.{' '}
              <button type="button" className="botao-texto" onClick={quotes.reload}>
                Tentar de novo
              </button>
            </p>
          )}
        </div>
      </div>

      <div className={s.abaixo}>
        <p className={`prosa ${s.ressalva}`}>
          Este é um valor de referência, calculado pelo ponto médio entre compra e venda. Bancos, cartões e casas de câmbio
          aplicam spread, tarifas e IOF, então o valor de uma operação real costuma ser diferente.
        </p>
        {result && rate && <CostSimulator received={result} to={to} />}
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </section>
  )
}
