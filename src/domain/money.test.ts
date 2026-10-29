import { describe, expect, it } from 'vitest'
import {
  Big,
  convert,
  distinctDecimals,
  formatMoney,
  formatPercent,
  formatPlain,
  formatRate,
  formatSignedRate,
  minorUnits,
  parseBrazilianNumber,
  percentChange,
  rateDecimals,
} from './money'

const NBSP = ' '
const norm = (s: string) => s.replaceAll(NBSP, ' ').replaceAll(' ', ' ')

function parsed(input: string) {
  const r = parseBrazilianNumber(input)
  if (!r.ok) throw new Error(`esperava sucesso para "${input}", veio ${r.reason}`)
  return r
}

describe('parseBrazilianNumber', () => {
  it('lê o formato brasileiro completo', () => {
    expect(parsed('1.234,56').value.toString()).toBe('1234.56')
    expect(parsed('1.234.567,8').value.toString()).toBe('1234567.8')
    expect(parsed('0,01').value.toString()).toBe('0.01')
    expect(parsed(',5').value.toString()).toBe('0.5')
  })

  it('trata pontos em grupos de três como milhares', () => {
    const r = parsed('1.234')
    expect(r.value.toString()).toBe('1234')
    expect(r.dotAsDecimal).toBe(false)
    expect(parsed('12.345.678').value.toString()).toBe('12345678')
  })

  it('aceita ponto decimal quando não forma milhar, sinalizando a interpretação', () => {
    const r = parsed('10.5')
    expect(r.value.toString()).toBe('10.5')
    expect(r.dotAsDecimal).toBe(true)
    expect(parsed('0.25').value.toString()).toBe('0.25')
  })

  it('ignora espaços e símbolo de moeda no início', () => {
    expect(parsed(' R$ 1.000,00 ').value.toString()).toBe('1000')
  })

  it('rejeita entradas ambíguas ou inválidas', () => {
    expect(parseBrazilianNumber('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseBrazilianNumber('-5')).toEqual({ ok: false, reason: 'negative' })
    expect(parseBrazilianNumber('1,2,3')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseBrazilianNumber('1.23.4')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseBrazilianNumber('12.34,5')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseBrazilianNumber('1,234.5')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseBrazilianNumber('abc')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseBrazilianNumber('1e5')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('limita tamanho e casas decimais', () => {
    expect(parseBrazilianNumber('99999999999999')).toEqual({ ok: false, reason: 'too-large' })
    expect(parseBrazilianNumber('1,123456789')).toEqual({ ok: false, reason: 'too-many-decimals' })
    expect(parsed('0000012').value.toString()).toBe('12')
  })
})

describe('conversão e arredondamento', () => {
  it('não acumula erro de ponto flutuante', () => {
    // 0,1 + 0,2 em float daria 0,30000000000000004
    expect(convert(new Big('0.1'), new Big('3')).toString()).toBe('0.3')
    expect(convert(new Big('1234.56'), new Big('5.3537')).toString()).toBe('6609.463872')
  })

  it('só arredonda na exibição, meio para cima', () => {
    const r = convert(new Big('100'), new Big('0.186789'))
    expect(r.toString()).toBe('18.6789')
    expect(norm(formatMoney(r, 'USD'))).toBe('US$ 18,68')
    expect(norm(formatMoney('2.345', 'BRL'))).toBe('R$ 2,35')
    expect(norm(formatMoney('2.344999', 'BRL'))).toBe('R$ 2,34')
  })

  it('respeita as casas decimais de cada moeda', () => {
    expect(minorUnits('BRL')).toBe(2)
    expect(minorUnits('JPY')).toBe(0)
    expect(minorUnits('CLP')).toBe(0)
    expect(norm(formatMoney('1234.5', 'JPY'))).toBe('JP¥ 1.235')
    expect(norm(formatMoney('1234567.891', 'BRL'))).toBe('R$ 1.234.567,89')
  })

  it('formata sem símbolo para o campo de resultado', () => {
    expect(formatMoney('1234.5', 'EUR', { withSymbol: false })).toBe('1.234,50')
  })

  it('formata valores para o campo de entrada', () => {
    expect(formatPlain(new Big('1234.5'), 2)).toBe('1.234,5')
    expect(formatPlain(new Big('1000'), 2)).toBe('1.000')
  })
})

describe('taxas e variações', () => {
  it('usa 4 casas para taxas ≥ 1 e 4 algarismos significativos abaixo', () => {
    expect(rateDecimals(5.3537)).toBe(4)
    expect(formatRate('5.35375')).toBe('5,3538')
    expect(formatRate('0.18678')).toBe('0,1868')
    expect(formatRate('0.00347628')).toBe('0,003476')
    expect(formatRate('0.000731')).toBe('0,0007310')
  })

  it('calcula variação percentual exata', () => {
    expect(percentChange('5.0', '5.5').toString()).toBe('10')
    expect(percentChange('4', '3').toString()).toBe('-25')
    expect(() => percentChange(0, 1)).toThrow()
  })

  it('formata variações com sinal e sinal de menos tipográfico', () => {
    expect(formatPercent('1.234')).toBe('+1,23%')
    expect(formatPercent('-0.4')).toBe('−0,40%')
    expect(formatPercent('0.001')).toBe('0,00%')
    expect(formatPercent('-0.001')).toBe('0,00%')
    expect(formatSignedRate('0.4064')).toBe('+0,4064')
    expect(formatSignedRate('-0.00003', 6)).toBe('−0,000030')
  })
})

describe('casas para distinguir compra e venda', () => {
  it('usa as casas padrão quando já bastam', () => {
    expect(distinctDecimals(new Big('5.3532'), new Big('5.3542'))).toBe(4)
  })

  it('acrescenta casas até que as duas taxas não pareçam iguais', () => {
    const d = distinctDecimals(new Big('0.003919608'), new Big('0.003920392'))
    expect(d).toBe(7)
    expect(formatRate('0.003919608', d)).not.toBe(formatRate('0.003920392', d))
  })

  it('não cresce sem limite quando as taxas são idênticas', () => {
    expect(distinctDecimals(new Big('0.5'), new Big('0.5'))).toBe(4)
  })
})
