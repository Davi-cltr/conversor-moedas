import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeDaily, normalizeLatest, dailyUrl, latestUrl } from './awesome'
import { normalizePtax, ptaxPeriodUrl } from './ptax'
import { ApiError, getJson } from './http'
import { clearCache, readCache, shared, writeCache } from './cache'
import { latestCodec } from './repository'
import { awesomeDailySample, awesomeLatestSample, ptaxSample } from '../test/fixtures'

afterEach(() => clearCache())

describe('normalização da AwesomeAPI', () => {
  it('lê cotações, convertendo segundos em milissegundos', () => {
    const { book, missing } = normalizeLatest(awesomeLatestSample, ['USD', 'EUR', 'GBP'])
    expect(book.USD.bid.toString()).toBe('5.3533')
    expect(book.USD.ask.toString()).toBe('5.3542')
    expect(book.USD.timestamp).toBe(1793214216000)
    expect(missing).toEqual(['GBP'])
  })

  it('descarta entradas sem preço válido', () => {
    const r = normalizeLatest({ USDBRL: { bid: '0', ask: 'x', timestamp: '1' }, EURBRL: awesomeLatestSample.EURBRL }, ['USD', 'EUR'])
    expect(Object.keys(r.book)).toEqual(['EUR'])
    expect(r.missing).toEqual(['USD'])
  })

  it('falha com erro claro quando nada é aproveitável', () => {
    expect(() => normalizeLatest({ USDBRL: {} }, ['USD'])).toThrow(ApiError)
    expect(() => normalizeLatest('html', ['USD'])).toThrow(ApiError)
  })

  it('agrupa o histórico diário por data de Brasília e ordena', () => {
    const pts = normalizeDaily(awesomeDailySample)
    expect(pts.map((p) => p.date)).toEqual(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26'])
    // ponto médio entre compra e venda
    expect(pts.at(-1)!.value).toBeCloseTo((5.3712 + 5.3716) / 2, 10)
  })

  it('monta as URLs documentadas', () => {
    expect(latestUrl(['USD', 'EUR'])).toBe('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL')
    expect(dailyUrl('ARS', '2026-01-01', '2026-02-01')).toBe(
      'https://economia.awesomeapi.com.br/json/daily/ARS-BRL/360?start_date=20260101&end_date=20260201',
    )
  })
})

describe('normalização da PTAX', () => {
  it('mantém só o boletim de fechamento, com venda e compra', () => {
    const pts = normalizePtax(ptaxSample)
    expect(pts.map((p) => p.date)).toEqual(['2026-10-22', '2026-10-23'])
    expect(pts[0]).toMatchObject({ value: 5.0383, buy: 5.0377 })
    expect(new Date(pts[1].publishedAt).toISOString()).toBe('2026-10-23T16:07:00.000Z')
  })

  it('rejeita formatos inesperados', () => {
    expect(() => normalizePtax({})).toThrow(ApiError)
    expect(normalizePtax({ value: [{ cotacaoVenda: 'x' }] })).toEqual([])
  })

  it('codifica os parâmetros OData', () => {
    const url = ptaxPeriodUrl('EUR', '2026-10-22', '2026-10-27')
    expect(url).toContain("@moeda=%27EUR%27")
    expect(url).toContain('@dataInicial=%2710-22-2026%27')
    expect(url).toContain("$filter=tipoBoletim%20eq%20'Fechamento'".replace(/'/g, '%27'))
  })
})

describe('getJson', () => {
  const ok = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

  it('classifica erros HTTP', async () => {
    await expect(getJson('u', { source: 'X', fetchImpl: ok({}, 429) })).rejects.toMatchObject({ kind: 'rate-limit' })
    await expect(getJson('u', { source: 'X', fetchImpl: ok({}, 404) })).rejects.toMatchObject({ kind: 'not-found' })
    await expect(getJson('u', { source: 'X', fetchImpl: ok({}, 500) })).rejects.toMatchObject({ kind: 'http', status: 500 })
  })

  it('classifica falha de conexão e resposta ilegível', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    await expect(getJson('u', { source: 'X', fetchImpl: offline })).rejects.toMatchObject({ kind: 'network' })
    const html = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch
    await expect(getJson('u', { source: 'X', fetchImpl: html })).rejects.toMatchObject({ kind: 'invalid' })
  })

  it('expira por tempo', async () => {
    const hang = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))),
    ) as unknown as typeof fetch
    await expect(getJson('u', { source: 'X', fetchImpl: hang, timeoutMs: 10 })).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('propaga cancelamento do chamador como AbortError', async () => {
    const hang = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))),
    ) as unknown as typeof fetch
    const c = new AbortController()
    const p = getJson('u', { source: 'X', fetchImpl: hang, signal: c.signal })
    c.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('cache e requisições compartilhadas', () => {
  it('persiste e restaura cotações com a data de origem', () => {
    const data = normalizeLatest(awesomeLatestSample, ['USD'])
    writeCache('latest', data, latestCodec, 123)
    // simula nova visita: limpa só a memória
    const raw = localStorage.getItem('lastro:v1:latest')!
    clearCache()
    localStorage.setItem('lastro:v1:latest', raw)
    const back = readCache('latest', latestCodec)!
    expect(back.savedAt).toBe(123)
    expect(back.data.book.USD.bid.toString()).toBe('5.3533')
  })

  it('faz uma só requisição para pedidos simultâneos', async () => {
    const run = vi.fn(async () => 42)
    const [a, b] = await Promise.all([shared('k', run), shared('k', run)])
    expect(a).toBe(42)
    expect(b).toBe(42)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('só cancela a requisição de rede quando todos desistem', async () => {
    let netSignal: AbortSignal | undefined
    const run = vi.fn((s: AbortSignal) => {
      netSignal = s
      return new Promise<number>((resolve) => setTimeout(() => resolve(7), 20))
    })
    const c1 = new AbortController()
    const p1 = shared('k2', run, c1.signal)
    const p2 = shared('k2', run)
    c1.abort()
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' })
    expect(netSignal?.aborted).toBe(false)
    await expect(p2).resolves.toBe(7)
  })
})
