import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { clearCache } from './api/cache'
import { Big, formatMoney } from './domain/money'
import { mockFetch } from './test/mockFetch'
import { awesomeLatestSample } from './test/fixtures'

// ponto médio da amostra real de USD-BRL (5,3533 / 5,3542)
const USD_MID = new Big(awesomeLatestSample.USDBRL.bid).plus(awesomeLatestSample.USDBRL.ask).div(2)

function result() {
  return screen.getByRole('status', { name: 'Você recebe' })
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  clearCache()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('conversão', () => {
  it('não mostra resultado inventado enquanto a cotação não chega', async () => {
    let release: () => void = () => {}
    const { impl } = mockFetch()
    const real = impl.getMockImplementation()!
    impl.mockImplementation(async (input) => {
      if (String(input).includes('/json/last/')) await new Promise<void>((r) => (release = r))
      return real(input)
    })
    render(<App />)
    expect(result().textContent).toBe('buscando cotação')
    release()
    await waitFor(() => expect(result().textContent).toBe(formatMoney(USD_MID.times(100), 'BRL', { withSymbol: false })))
    expect(result().textContent).toBe('535,38')
  })

  it('lê valores no padrão brasileiro e converte sem arredondar antes do fim', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(result().textContent).toBe('535,38'))
    const input = screen.getByLabelText('Você converte')
    await user.clear(input)
    await user.type(input, '1.234,56')
    // 1234,56 × 5,35375 = 6.609,5256 → 6.609,53
    expect(result().textContent).toBe(formatMoney(new Big('1234.56').times(USD_MID), 'BRL', { withSymbol: false }))
    expect(result().textContent).toBe('6.609,53')
    expect(screen.getByText(/1 USD = 5,3538 BRL/)).toBeTruthy()
  })

  it('inverte as moedas e a taxa aplicada', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(result().textContent).toBe('535,38'))
    await user.click(screen.getByRole('button', { name: /Inverter/ }))
    expect(screen.getByRole('button', { name: /Moeda de origem: Real brasileiro/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Moeda de destino: Dólar americano/ })).toBeTruthy()
    // 100 / 5,35375 = 18,678…
    expect(result().textContent).toBe('18,68')
    expect(screen.getByText(/1 BRL = 0,1868 USD/)).toBeTruthy()
  })

  it('usa zero casas decimais para o iene', async () => {
    mockFetch()
    window.history.replaceState(null, '', '/?de=BRL&para=JPY&valor=100')
    render(<App />)
    // 100 / ((0,03389506 + 0,03397624) / 2) = 2.946,7…
    await waitFor(() => expect(result().textContent).toBe('2.947'))
  })

  it('explica a entrada inválida e não converte', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(result().textContent).toBe('535,38'))
    const input = screen.getByLabelText('Você converte')
    await user.clear(input)
    await user.type(input, '12,3,4')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText(/Use números com vírgula/)).toBeTruthy()
    expect(result().textContent).toBe('—')
  })

  it('sem conexão, avisa e não estima a cotação', async () => {
    mockFetch({ offline: true })
    render(<App />)
    const alert = await screen.findByText(/Não foi possível conectar à AwesomeAPI/)
    expect(alert.textContent).toMatch(/não será estimada/)
    expect(result().textContent).toBe('—')
    expect(screen.getAllByRole('button', { name: 'Tentar de novo' }).length).toBeGreaterThan(0)
  })
})

describe('histórico', () => {
  it('troca de período recalcula indicadores com o intervalo novo', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<App />)
    const hist = document.getElementById('historico')!
    const chart = await within(hist).findByRole('group', { name: /Quanto valeu 1 dólar americano em reais/ })
    const notes = () => within(hist).getByText(/cotações de/).textContent!
    const before = notes()
    expect(chart.getAttribute('aria-label')).toMatch(/Use as setas/)

    await user.click(within(hist).getByRole('button', { name: 'últimos 7 dias' }))
    expect(within(hist).getByRole('button', { name: 'últimos 7 dias' }).getAttribute('aria-pressed')).toBe('true')
    const after = notes()
    expect(after).not.toBe(before)
    // 7 dias corridos têm no máximo 6 dias úteis com PTAX
    expect(Number(after.match(/^(\d+)/)![1])).toBeLessThanOrEqual(6)
  })

  it('percorre o gráfico pelo teclado e anuncia o valor', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<App />)
    const chart = await screen.findByRole('group', { name: /Quanto valeu 1 dólar americano/ })
    chart.focus()
    await user.keyboard('{Home}')
    const live = chart.parentElement!.querySelector('[aria-live="polite"]')!
    expect(live.textContent).toMatch(/^\d{1,2} de \p{L}+ de \d{4}: USD \d+,\d{4}$/u)
  })
})
