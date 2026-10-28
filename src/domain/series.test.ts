import { describe, expect, it } from 'vitest'
import {
  changeOverDays,
  computeStats,
  downsampleMinMax,
  findGaps,
  nearestIndex,
  niceTicks,
  pairSeries,
  pointOnOrBefore,
  rebaseToPercent,
  sliceRange,
  type Point,
} from './series'

const usd: Point[] = [
  { date: '2026-10-19', value: 5.0564 },
  { date: '2026-10-20', value: 5.014 },
  { date: '2026-10-21', value: 5.0277 },
  { date: '2026-10-22', value: 5.0383 },
  { date: '2026-10-23', value: 5.0377 },
  { date: '2026-10-26', value: 5.5007 },
]

const eur: Point[] = [
  { date: '2026-10-19', value: 5.9 },
  { date: '2026-10-20', value: 5.85 },
  // 21/10 ausente na série do euro
  { date: '2026-10-22', value: 5.88 },
  { date: '2026-10-23', value: 5.86 },
  { date: '2026-10-26', value: 6.4 },
]

describe('pairSeries', () => {
  it('mantém a série em reais quando a cotação é BRL', () => {
    expect(pairSeries(usd, null)).toEqual(usd)
  })

  it('inverte quando a base é o real', () => {
    const inv = pairSeries(null, usd)
    expect(inv[0].value).toBeCloseTo(1 / 5.0564, 12)
  })

  it('calcula a taxa cruzada só nas datas presentes nas duas pontas', () => {
    const eurUsd = pairSeries(eur, usd)
    expect(eurUsd.map((p) => p.date)).toEqual(['2026-10-19', '2026-10-20', '2026-10-22', '2026-10-23', '2026-10-26'])
    expect(eurUsd[0].value).toBeCloseTo(5.9 / 5.0564, 10)
  })
})

describe('computeStats', () => {
  it('encontra início, fim, máxima, mínima e variações', () => {
    const s = computeStats(usd)!
    expect(s.first.date).toBe('2026-10-19')
    expect(s.last.value).toBe(5.5007)
    expect(s.max).toEqual({ date: '2026-10-26', value: 5.5007 })
    expect(s.min).toEqual({ date: '2026-10-20', value: 5.014 })
    expect(s.absChange.toString()).toBe('0.4443')
    expect(s.pctChange.toFixed(4)).toBe('8.7869')
    expect(s.count).toBe(6)
  })

  it('aceita um único ponto e rejeita série vazia', () => {
    expect(computeStats([usd[0]])!.pctChange.toString()).toBe('0')
    expect(computeStats([])).toBeNull()
  })
})

describe('recortes e variações por período', () => {
  it('recorta por intervalo inclusivo', () => {
    expect(sliceRange(usd, '2026-10-20', '2026-10-22').length).toBe(3)
  })

  it('pega o último ponto até uma data', () => {
    expect(pointOnOrBefore(usd, '2026-10-25')?.date).toBe('2026-10-23')
    expect(pointOnOrBefore(usd, '2026-10-01')).toBeNull()
  })

  it('compara com o último dado de N dias antes', () => {
    const c = changeOverDays(usd, 7)!
    expect(c.from.date).toBe('2026-10-19')
    expect(c.to.date).toBe('2026-10-26')
    // série não alcança 30 dias atrás
    expect(changeOverDays(usd, 30)).toBeNull()
  })

  it('reescreve como variação percentual a partir do início', () => {
    const r = rebaseToPercent(usd)
    expect(r[0].value).toBe(0)
    expect(r.at(-1)!.value).toBeCloseTo(8.7869, 3)
  })
})

describe('lacunas e desenho', () => {
  it('identifica dias úteis sem cotação, sem contar fins de semana', () => {
    expect(findGaps(usd)).toEqual([])
    const gaps = findGaps(eur)
    expect(gaps).toEqual([{ after: '2026-10-20', before: '2026-10-22', missingBusinessDays: 1 }])
  })

  it('reduz pontos preservando extremos', () => {
    const many: Point[] = Array.from({ length: 1000 }, (_, i) => ({
      date: `2020-01-01-${i}`,
      value: i === 500 ? 99 : i === 700 ? -99 : Math.sin(i / 10),
    }))
    const d = downsampleMinMax(many, 50)
    expect(d.length).toBeLessThanOrEqual(102)
    expect(d.some((p) => p.value === 99)).toBe(true)
    expect(d.some((p) => p.value === -99)).toBe(true)
    expect(d[0]).toBe(many[0])
    expect(d.at(-1)).toBe(many.at(-1))
  })

  it('acha o ponto mais próximo de uma data', () => {
    expect(nearestIndex(usd, '2026-10-24')).toBe(4)
    expect(nearestIndex(usd, '2026-10-25')).toBe(5)
    expect(nearestIndex(usd, '2030-01-01')).toBe(5)
  })

  it('gera marcas redondas para o eixo', () => {
    expect(niceTicks(5.01, 5.5, 5)).toEqual([5.1, 5.2, 5.3, 5.4, 5.5])
    expect(niceTicks(2, 2, 3).length).toBeGreaterThan(0)
  })
})
