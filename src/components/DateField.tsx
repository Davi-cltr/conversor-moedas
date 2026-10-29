import { useRef, useState } from 'react'
import { formatDate, maskBrazilianDate, parseBrazilianDate, type IsoDate } from '../domain/dates'
import s from './DateField.module.css'

interface Props {
  id: string
  /** Data atual em ISO, ou '' quando o campo ainda não forma uma data. */
  value: IsoDate | ''
  /** `typed` é o texto exibido, para quem quiser distinguir "incompleto" de "inexistente". */
  onChange: (iso: IsoDate | '', typed: string) => void
  min?: IsoDate
  max?: IsoDate
  invalid?: boolean
  describedBy?: string
  /** Nome acessível do botão de calendário ("Abrir calendário da data inicial"). */
  calendarLabel: string
}

const canShowPicker = typeof HTMLInputElement !== 'undefined' && 'showPicker' in HTMLInputElement.prototype

/**
 * Campo de data sempre em dd/mm/aaaa. O `<input type="date">` nativo exibe a
 * data no formato do idioma do navegador (10/29/2025 num navegador em
 * inglês), o que confunde num produto em português; por isso o texto é
 * nosso. O calendário nativo continua disponível pelo botão, quando o
 * navegador oferece `showPicker()`.
 */
export function DateField({ id, value, onChange, min, max, invalid, describedBy, calendarLabel }: Props) {
  const [text, setText] = useState(() => (value ? formatDate(value) : ''))
  const [shown, setShown] = useState(value)
  const pickerRef = useRef<HTMLInputElement>(null)

  // valor trocado por fora (atalhos "há 5 anos", calendário): reescreve o texto
  if (value !== shown) {
    setShown(value)
    if (value && parseBrazilianDate(text) !== value) setText(formatDate(value))
  }

  function onText(next: string) {
    const masked = maskBrazilianDate(next)
    setText(masked)
    const iso = parseBrazilianDate(masked) ?? ''
    setShown(iso)
    onChange(iso, masked)
  }

  return (
    <span className={s.campo} data-invalid={invalid || undefined}>
      <input
        id={id}
        className={s.texto}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        value={text}
        onChange={(e) => onText(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      {canShowPicker && (
        <>
          <button
            type="button"
            className={s.calendario}
            aria-label={calendarLabel}
            onClick={() => {
              try {
                pickerRef.current?.showPicker()
              } catch {
                // alguns navegadores só permitem o calendário com gesto direto; o texto continua funcionando
              }
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="2" y="3" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
          <input
            ref={pickerRef}
            className={s.nativo}
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            min={min}
            max={max}
            value={value}
            onChange={(e) => {
              const iso = e.target.value
              const typed = iso ? formatDate(iso) : ''
              setText(typed)
              setShown(iso)
              onChange(iso, typed)
            }}
          />
        </>
      )}
    </span>
  )
}
