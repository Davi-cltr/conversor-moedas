import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimeMachine } from './TimeMachine'
import { clearCache } from '../../api/cache'
import { mockFetch } from '../../test/mockFetch'

afterEach(() => {
  clearCache()
  vi.unstubAllGlobals()
})

const TODAY = '2026-10-23'

describe('seu real em outra data', () => {
  it('compara o poder de compra nas dez moedas com PTAX', async () => {
    mockFetch()
    render(<TimeMachine today={TODAY} />)
    const list = await screen.findByRole('list', { name: /Poder de compra de R\$\s1\.000,00/ })
    expect(list.querySelectorAll('li')).toHaveLength(10)
    expect(screen.getByText(/Mostra só o efeito do câmbio/)).toBeTruthy()
  })

  it('aceita a data digitada em dd/mm/aaaa e só reclama quando ela está completa', async () => {
    const { calls } = mockFetch()
    const user = userEvent.setup()
    render(<TimeMachine today={TODAY} />)
    await screen.findByRole('list', { name: /Poder de compra/ })
    const field = screen.getByLabelText('Data no passado')
    await user.clear(field)
    await user.type(field, '1503')
    expect(field).toHaveProperty('value', '15/03')
    expect(field.getAttribute('aria-invalid')).toBeNull()
    await user.type(field, '2016')
    expect(field).toHaveProperty('value', '15/03/2016')
    await waitFor(() => expect(calls.some((u) => u.includes("dataFinalCotacao=%2703-15-2016%27"))).toBe(true))
    await user.clear(field)
    await user.type(field, '31022020')
    expect(screen.getByText('Essa data não existe no calendário.')).toBeTruthy()
  })

  it('sem conexão, mostra a falha em vez de dizer que não há dados', async () => {
    mockFetch({ offline: true })
    render(<TimeMachine today={TODAY} />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Não foi possível conectar/)
    expect(screen.queryByText(/Não há PTAX publicada/)).toBeNull()
  })
})
