import { describe, expect, it } from 'vitest'
import { Big } from './money'
import { applyCosts, midInBrl, pairRate, type QuoteBook } from './rates'
import { pairHistorySource, searchCurrencies, currencySymbol } from './currencies'
import { presetRange, validateRange } from './periods'

const book: QuoteBook = {
  USD: { code: 'USD', bid: new Big('5.3533'), ask: new Big('5.3542'), high: new Big('5.39'), low: new Big('5.31'), pctChange: new Big('0.03'), timestamp: 2000 },
  EUR: { code: 'EUR', bid: new Big('5.9754'), ask: new Big('5.9774'), high: new Big('6'), low: new Big('5.9'), pctChange: new Big('0.35'), timestamp: 1000 },
}

describe('taxas a partir das cotações em reais', () => {
  it('usa o ponto médio entre compra e venda', () => {
    expect(midInBrl('USD', book)!.toString()).toBe('5.35375')
    expect(midInBrl('BRL', book)!.toString()).toBe('1')
    expect(midInBrl('GBP', book)).toBeNull()
  })

  it('converte de moeda estrangeira para real com compra/venda diretas', () => {
    const r = pairRate('USD', 'BRL', book)!
    expect(r.rate.toString()).toBe('5.35375')
    expect(r.bidAsk?.bid.toString()).toBe('5.3533')
    expect(r.isCross).toBe(false)
  })

  it('a inversão é a recíproca exata', () => {
    const a = pairRate('USD', 'BRL', book)!
    const b = pairRate('BRL', 'USD', book)!
    expect(a.rate.times(b.rate).round(18).toString()).toBe('1')
  })

  it('calcula taxa cruzada via real e usa o instante mais antigo', () => {
    const r = pairRate('EUR', 'USD', book)!
    expect(r.isCross).toBe(true)
    expect(r.bidAsk).toBeNull()
    expect(r.rate.toFixed(6)).toBe('1.116302')
    expect(r.timestamp).toBe(1000)
  })

  it('converte moeda para ela mesma com taxa 1', () => {
    expect(pairRate('USD', 'USD', book)!.rate.toString()).toBe('1')
  })

  it('aplica custos hipotéticos informados pelo usuário', () => {
    const r = applyCosts(new Big(100), new Big(4), new Big(0))
    expect(r.toFixed(4)).toBe('96.1538')
    expect(applyCosts(new Big(100), new Big(0), new Big(0)).toString()).toBe('100')
  })
})

describe('moedas', () => {
  it('busca por código, nome, região e sem acento', () => {
    expect(searchCurrencies('usd')[0].code).toBe('USD')
    expect(searchCurrencies('dolar').map((c) => c.code)).toEqual(['USD', 'CAD', 'AUD'])
    expect(searchCurrencies('japao')[0].code).toBe('JPY')
    expect(searchCurrencies('yuan')[0].code).toBe('CNY')
    expect(searchCurrencies('xyz')).toEqual([])
  })

  it('distingue símbolos parecidos', () => {
    expect(currencySymbol('USD')).toBe('US$')
    expect(currencySymbol('CAD')).toBe('CA$')
    expect(currencySymbol('BRL')).toBe('R$')
  })

  it('escolhe a fonte do histórico sem misturar fontes num par', () => {
    expect(pairHistorySource('USD', 'BRL')).toBe('ptax')
    expect(pairHistorySource('EUR', 'USD')).toBe('ptax')
    expect(pairHistorySource('ARS', 'BRL')).toBe('awesome')
    expect(pairHistorySource('USD', 'ARS')).toBe('awesome')
  })
})

describe('períodos', () => {
  it('calcula os intervalos predefinidos a partir de hoje', () => {
    expect(presetRange('7d', '2026-10-28')).toEqual({ start: '2026-10-21', end: '2026-10-28' })
    expect(presetRange('1a', '2026-10-28')).toEqual({ start: '2025-10-28', end: '2026-10-28' })
  })

  it('valida intervalos personalizados', () => {
    const today = '2026-10-28'
    expect(validateRange({ start: '2026-01-01', end: '2026-06-01' }, { today, source: 'ptax' })).toBeNull()
    expect(validateRange({ start: '2026-06-01', end: '2026-01-01' }, { today, source: 'ptax' })).toBe('start-after-end')
    expect(validateRange({ start: '2026-01-01', end: '2026-12-01' }, { today, source: 'ptax' })).toBe('future')
    expect(validateRange({ start: '1990-01-01', end: '2000-01-01' }, { today, source: 'ptax' })).toBe('too-old')
    expect(validateRange({ start: '2010-01-01', end: '2026-01-01' }, { today, source: 'ptax' })).toBe('too-long')
    expect(validateRange({ start: '2024-01-01', end: '2026-01-01' }, { today, source: 'awesome' })).toBe('too-long')
    expect(validateRange({ start: '', end: '2026-01-01' }, { today, source: 'ptax' })).toBe('invalid-date')
  })
})
