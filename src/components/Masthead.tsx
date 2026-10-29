import { useEffect, useState } from 'react'
import { describeMoment } from '../domain/dates'
import s from './Masthead.module.css'

type Theme = 'auto' | 'light' | 'dark'
const THEME_KEY = 'lastro:tema'

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return t === 'light' || t === 'dark' ? t : 'auto'
  } catch {
    return 'auto'
  }
}

const NEXT: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' }
const LABEL: Record<Theme, string> = { auto: 'Tema automático', light: 'Tema claro', dark: 'Tema luz UV' }

interface Props {
  marketAt: number | null
  loading: boolean
  now: number
}

export function Masthead({ marketAt, loading, now }: Props) {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      if (theme === 'auto') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, theme)
    } catch {
      // sem armazenamento: o tema vale só nesta visita
    }
  }, [theme])

  return (
    <header className={`secao ${s.topo}`}>
      <div className={s.marca}>
        <p className={s.nome}>Lastro</p>
        <p className={s.lema}>Conversor de moedas com o histórico oficial do câmbio</p>
      </div>
      <div className={s.lado}>
        <p className={s.status} role="status" aria-live="polite">
          <span className={s.ponto} data-loading={loading || undefined} aria-hidden="true" />
          {marketAt ? <>Mercado atualizado {describeMoment(marketAt, now)}</> : loading ? 'Conectando às fontes…' : 'Cotações indisponíveis'}
        </p>
        <nav aria-label="Seções" className={s.nav}>
          <a href="#historico">Histórico</a>
          <a href="#outra-data">Outra data</a>
          <a href="#sobre">Sobre os dados</a>
        </nav>
        <button type="button" className={s.tema} onClick={() => setTheme(NEXT[theme])} aria-label={`${LABEL[theme]}. Mudar tema`}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10 3a7 7 0 0 1 0 14z" fill={theme === 'light' ? 'none' : 'currentColor'} />
          </svg>
          <span className={s.temaTexto}>{LABEL[theme]}</span>
        </button>
      </div>
    </header>
  )
}
