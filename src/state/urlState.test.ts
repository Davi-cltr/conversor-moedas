import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE, readState, writeState } from './urlState'

describe('estado na URL', () => {
  it('usa os padrões quando não há parâmetros', () => {
    expect(readState('')).toEqual(DEFAULT_STATE)
  })

  it('lê moedas, valor, período e comparação, normalizando o valor', () => {
    const s = readState('?de=eur&para=JPY&valor=2500,5&periodo=2024-01-01_2024-06-30&comparar=USD,EUR,ARS,USD')
    expect(s.from).toBe('EUR')
    expect(s.to).toBe('JPY')
    expect(s.amountText).toBe('2.500,5')
    expect(s.period).toEqual({ kind: 'custom', range: { start: '2024-01-01', end: '2024-06-30' } })
    // ARS não tem PTAX; repetições são descartadas
    expect(s.compare).toEqual(['USD', 'EUR'])
  })

  it('ignora valores inválidos em vez de quebrar', () => {
    const s = readState('?de=XYZ&valor=abc&periodo=2024-13-01_2024-01-01')
    expect(s.from).toBe(DEFAULT_STATE.from)
    expect(s.amountText).toBe(DEFAULT_STATE.amountText)
    expect(s.period).toEqual(DEFAULT_STATE.period)
  })

  it('ida e volta preserva o estado', () => {
    const s = { ...DEFAULT_STATE, from: 'GBP', to: 'BRL', amountText: '1.234,56', compare: ['USD', 'GBP'] }
    expect(readState(writeState(s))).toEqual(s)
  })
})
