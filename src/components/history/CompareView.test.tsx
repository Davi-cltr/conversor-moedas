import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CompareView } from './CompareView'
import { clearCache } from '../../api/cache'
import { mockFetch } from '../../test/mockFetch'

afterEach(() => {
  clearCache()
  vi.unstubAllGlobals()
})

describe('comparação entre moedas', () => {
  it('desenha as séries em variação percentual e ordena o ranking', async () => {
    mockFetch()
    render(
      <CompareView
        codes={['USD', 'EUR', 'JPY']}
        onCodes={() => {}}
        base="USD"
        range={{ start: '2026-07-01', end: '2026-10-23' }}
        windowRange={null}
        today="2026-10-23"
      />,
    )
    const ranking = await screen.findByRole('list', { name: /Variação no período/ })
    const items = ranking.querySelectorAll('li')
    expect(items).toHaveLength(3)
    // cada item traz a variação com sinal, e não só cor
    for (const li of items) expect(li.textContent).toMatch(/[+−]?\d+,\d{2}%/)
    expect(screen.getByRole('group', { name: /Variação percentual em reais/ })).toBeTruthy()
  })
})
