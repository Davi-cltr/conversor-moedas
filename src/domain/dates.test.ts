import { describe, expect, it } from 'vitest'
import {
  addDays,
  addYears,
  businessDaysBetween,
  describeMoment,
  diffDays,
  formatDate,
  isIsoDate,
  isoDateInBrazil,
  maskBrazilianDate,
  parseBrazilianDate,
  parsePtaxDateTime,
  toAwesomeParam,
  toPtaxParam,
  todayInBrazil,
} from './dates'

describe('datas de calendário', () => {
  it('valida datas ISO reais', () => {
    expect(isIsoDate('2026-10-28')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('28/10/2026')).toBe(false)
  })

  it('soma dias atravessando meses e anos', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(diffDays('2026-10-01', '2026-10-28')).toBe(27)
  })

  it('subtrai anos preservando o fim de fevereiro', () => {
    expect(addYears('2026-10-28', -1)).toBe('2025-10-28')
    expect(addYears('2024-02-29', -1)).toBe('2023-02-28')
  })

  it('conta dias úteis entre duas datas', () => {
    // sexta 23/10 → segunda 26/10: só fim de semana no meio
    expect(businessDaysBetween('2026-10-23', '2026-10-26')).toBe(0)
    // segunda 26/10 → quarta 28/10: falta a terça
    expect(businessDaysBetween('2026-10-26', '2026-10-28')).toBe(1)
  })

  it('usa o fuso de Brasília para "hoje"', () => {
    // 02:30 UTC de 29/10 ainda é 23:30 de 28/10 em Brasília
    const ms = Date.parse('2026-10-29T02:30:00Z')
    expect(todayInBrazil(ms)).toBe('2026-10-28')
    expect(isoDateInBrazil(1793214216000)).toBe('2026-10-28')
  })

  it('gera os formatos exigidos pelas APIs', () => {
    expect(toPtaxParam('2026-01-31')).toBe('01-31-2026')
    expect(toAwesomeParam('2026-01-31')).toBe('20260131')
  })

  it('lê a data-hora da PTAX como horário de Brasília', () => {
    const r = parsePtaxDateTime('2026-10-19 13:05:47.20983')
    expect(r?.date).toBe('2026-10-19')
    expect(new Date(r!.epochMs).toISOString()).toBe('2026-10-19T16:05:00.000Z')
    expect(parsePtaxDateTime('lixo')).toBeNull()
  })

  it('formata datas em português', () => {
    expect(formatDate('2026-10-28')).toBe('28/10/2026')
    expect(formatDate('2026-10-28', 'long')).toBe('28 de outubro de 2026')
    expect(formatDate('2026-10-28', 'axis-day')).toBe('28 de out')
  })

  it('descreve o momento de uma cotação em relação a agora', () => {
    const now = Date.parse('2026-10-28T19:10:00Z') // 16:10 em Brasília
    expect(describeMoment(Date.parse('2026-10-28T19:03:00Z'), now)).toBe('hoje às 16:03')
    expect(describeMoment(Date.parse('2026-10-27T20:59:00Z'), now)).toBe('ontem às 17:59')
    expect(describeMoment(Date.parse('2026-10-23T20:59:00Z'), now)).toBe('sexta-feira, 23 de outubro às 17:59')
  })
})

describe('datas digitadas no padrão brasileiro', () => {
  it('lê dd/mm/aaaa sem depender do idioma do navegador', () => {
    expect(parseBrazilianDate('29/10/2025')).toBe('2025-10-29')
    expect(parseBrazilianDate('1/2/2024')).toBe('2024-02-01')
    expect(parseBrazilianDate('29-02-2024')).toBe('2024-02-29')
  })

  it('recusa datas incompletas, inexistentes ou no formato americano', () => {
    expect(parseBrazilianDate('29/10/25')).toBeNull()
    expect(parseBrazilianDate('31/02/2026')).toBeNull()
    expect(parseBrazilianDate('10/29/2025')).toBeNull()
    expect(parseBrazilianDate('')).toBeNull()
  })

  it('insere as barras conforme os dígitos são digitados', () => {
    expect(maskBrazilianDate('2')).toBe('2')
    expect(maskBrazilianDate('291')).toBe('29/1')
    expect(maskBrazilianDate('29102')).toBe('29/10/2')
    expect(maskBrazilianDate('29/10/20259')).toBe('29/10/2025')
    expect(maskBrazilianDate('29/')).toBe('29')
  })

  it('formatDate e parseBrazilianDate são inversos', () => {
    for (const iso of ['1999-01-04', '2024-02-29', '2026-10-29']) expect(parseBrazilianDate(formatDate(iso))).toBe(iso)
  })
})
