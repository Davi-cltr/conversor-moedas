import { Big } from './money'
import { BASE_CURRENCY } from './currencies'

/** Cotação comercial de uma moeda em reais (par XXX-BRL). */
export interface MarketQuote {
  code: string
  /** Compra: quanto o mercado paga em reais por 1 unidade. */
  bid: Big
  /** Venda: quanto o mercado cobra em reais por 1 unidade. */
  ask: Big
  high: Big
  low: Big
  /** Variação percentual desde o fechamento anterior, informada pela fonte. */
  pctChange: Big
  /** Instante da cotação (ms). */
  timestamp: number
}

export type QuoteBook = Readonly<Record<string, MarketQuote>>

/** Ponto médio entre compra e venda, em reais. O real vale 1. */
export function midInBrl(code: string, book: QuoteBook): Big | null {
  if (code === BASE_CURRENCY) return new Big(1)
  const q = book[code]
  return q ? q.bid.plus(q.ask).div(2) : null
}

export interface PairRate {
  from: string
  to: string
  /** Unidades de `to` por 1 unidade de `from` (ponto médio). */
  rate: Big
  /** Compra e venda diretas, quando uma das pontas é o real. */
  bidAsk: { bid: Big; ask: Big; quotedCode: string } | null
  /** Par calculado através do real (nenhuma ponta é BRL). */
  isCross: boolean
  /** Instante da cotação mais antiga usada no cálculo. */
  timestamp: number
}

export function pairRate(from: string, to: string, book: QuoteBook): PairRate | null {
  const a = midInBrl(from, book)
  const b = midInBrl(to, book)
  if (!a || !b || b.eq(0)) return null
  const stamps = [from, to].filter((c) => c !== BASE_CURRENCY).map((c) => book[c].timestamp)
  const timestamp = stamps.length ? Math.min(...stamps) : Date.now()
  let bidAsk: PairRate['bidAsk'] = null
  if (from === BASE_CURRENCY && to !== BASE_CURRENCY) bidAsk = { bid: book[to].bid, ask: book[to].ask, quotedCode: to }
  if (to === BASE_CURRENCY && from !== BASE_CURRENCY) bidAsk = { bid: book[from].bid, ask: book[from].ask, quotedCode: from }
  return {
    from,
    to,
    rate: from === to ? new Big(1) : a.div(b),
    bidAsk,
    isCross: from !== BASE_CURRENCY && to !== BASE_CURRENCY && from !== to,
    timestamp,
  }
}

/**
 * Aplica custos hipotéticos informados pelo usuário (spread e IOF, em %).
 * Ambos reduzem o que se recebe: recebido / ((1 + spread)(1 + iof)).
 * É uma estimativa: cada prestador calcula de um jeito.
 */
export function applyCosts(received: Big, spreadPct: Big, iofPct: Big): Big {
  const factor = new Big(1).plus(spreadPct.div(100)).times(new Big(1).plus(iofPct.div(100)))
  return received.div(factor)
}
