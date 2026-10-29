import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CURRENCIES, currencySymbol, getCurrency, searchCurrencies, type Currency } from '../../domain/currencies'
import s from './CurrencyPicker.module.css'

interface Props {
  value: string
  onChange: (code: string) => void
  /** Texto do rótulo acessível ("Moeda de origem"). */
  label: string
  /** Código que já está do outro lado (marcado, não bloqueado). */
  otherSide?: string
  /** Moedas sem cotação disponível no momento. */
  unavailable?: readonly string[]
}

const HISTORY_LABEL: Record<Currency['history'], string> = {
  ptax: 'Histórico oficial do Banco Central',
  awesome: 'Histórico comercial',
  base: 'Moeda de referência',
}

export function CurrencyPicker({ value, onChange, label, otherSide, unavailable = [] }: Props) {
  const current = getCurrency(value)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const ids = useId()

  const results = useMemo(() => searchCurrencies(query, CURRENCIES), [query])
  const grouped = query.trim() === ''

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
      requestAnimationFrame(() => inputRef.current?.focus())
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close()
      else d.removeAttribute('open')
    }
  }, [open])

  // mantém a opção ativa visível ao navegar pelo teclado
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open])

  function openPicker() {
    setQuery('')
    const idx = CURRENCIES.findIndex((c) => c.code === value)
    setActive(Math.max(0, idx))
    setOpen(true)
  }

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function choose(code: string) {
    onChange(code)
    close()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(results.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const c = results[active]
      if (c) choose(c.code)
    }
  }

  const optionId = (i: number) => `${ids}-opt-${i}`
  const firstMoreIndex = grouped ? results.findIndex((c) => c.group === 'mais') : -1

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={s.trigger}
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-label={`${label}: ${current?.name ?? value} (${value}). Alterar`}
      >
        <span className={s.code}>{value}</span>
        <svg className={s.chevron} viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        className={s.dialog}
        aria-labelledby={`${ids}-title`}
        onCancel={(e) => {
          e.preventDefault()
          close()
        }}
        onClick={(e) => {
          // clique no fundo fecha
          if (e.target === dialogRef.current) close()
        }}
      >
        {open && (
          <div className={s.panel}>
            <div className={s.head}>
              <h2 id={`${ids}-title`} className={s.title}>
                {label}
              </h2>
              <button type="button" className={s.close} onClick={close} aria-label="Fechar">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </button>
            </div>
            <label className="sr-only" htmlFor={`${ids}-search`}>
              Buscar moeda por código, nome ou país
            </label>
            <input
              ref={inputRef}
              id={`${ids}-search`}
              className={s.search}
              type="search"
              role="combobox"
              aria-expanded="true"
              aria-controls={`${ids}-list`}
              aria-activedescendant={results[active] ? optionId(active) : undefined}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              placeholder="Buscar: dólar, EUR, Japão…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
            />
            <ul ref={listRef} id={`${ids}-list`} role="listbox" aria-label="Moedas" className={s.list}>
              {results.map((c, i) => {
                const missing = unavailable.includes(c.code)
                return (
                  <li
                    key={c.code}
                    id={optionId(i)}
                    data-index={i}
                    role="option"
                    aria-selected={c.code === value}
                    aria-disabled={missing || undefined}
                    className={s.option}
                    data-active={i === active || undefined}
                    data-group-start={i === firstMoreIndex || undefined}
                    onMouseMove={() => setActive(i)}
                    onClick={() => !missing && choose(c.code)}
                  >
                    <span className={s.optCode}>{c.code}</span>
                    <span className={s.optName}>
                      {c.name}
                      <span className={s.optMeta}>
                        {c.region}
                        {currencySymbol(c.code) !== c.code && <span className={s.symbol}>{currencySymbol(c.code)}</span>}
                      </span>
                    </span>
                    <span className={s.optSide}>
                      {c.code === value && <span className={s.tag}>Selecionada</span>}
                      {c.code === otherSide && c.code !== value && <span className={s.tag}>No outro lado</span>}
                      {missing ? (
                        <span className={s.tag}>Sem cotação agora</span>
                      ) : (
                        <span className={s.history}>{HISTORY_LABEL[c.history]}</span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
            {results.length === 0 && (
              <p className={s.empty} role="status">
                Nenhuma moeda encontrada para “{query}”. Tente o código de três letras (ex.: USD) ou o nome do país.
              </p>
            )}
          </div>
        )}
      </dialog>
    </>
  )
}
