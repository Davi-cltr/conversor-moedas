import { useId, useState } from 'react'
import { Big, formatMoney, formatPercent, parseBrazilianNumber, percentChange } from '../../domain/money'
import { applyCosts } from '../../domain/rates'
import s from './CostSimulator.module.css'

interface Props {
  received: Big
  to: string
}

/**
 * Simulação de custos com taxas que a própria pessoa informa.
 * O Lastro não sugere valores de spread ou IOF: eles variam por
 * prestador, tipo de operação e mudam por decreto.
 */
export function CostSimulator({ received, to }: Props) {
  const ids = useId()
  const [open, setOpen] = useState(false)
  const [spread, setSpread] = useState('')
  const [iof, setIof] = useState('')

  const sp = readPct(spread)
  const io = readPct(iof)
  const valid = sp !== 'invalid' && io !== 'invalid'
  const anyCost = valid && (sp.gt(0) || io.gt(0))
  const net = valid ? applyCosts(received, sp, io) : null
  const diff = net && received.gt(0) ? percentChange(received, net) : null

  return (
    <div className={s.wrap}>
      <button
        type="button"
        className="botao-texto"
        aria-expanded={open}
        aria-controls={`${ids}-painel`}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Ocultar simulação de custos' : 'Simular custos da operação'}
      </button>
      {open && (
        <div id={`${ids}-painel`} className={s.painel}>
          <p className={s.intro}>Informe as taxas que o seu banco, cartão ou casa de câmbio cobra.</p>
          <div className={s.campos}>
            <Field id={`${ids}-spread`} label="Spread" value={spread} onChange={setSpread} invalid={sp === 'invalid'} />
            <Field id={`${ids}-iof`} label="IOF" value={iof} onChange={setIof} invalid={io === 'invalid'} />
          </div>
          <p className={s.saida} aria-live="polite">
            {!valid ? (
              'Use porcentagens entre 0 e 100, como 4 ou 3,5.'
            ) : anyCost && net ? (
              <>
                Com esses custos, você receberia cerca de <strong className="num">{formatMoney(net, to)}</strong>{' '}
                <span className="num">({formatPercent(diff!)})</span>.
              </>
            ) : (
              'Sem custos informados, o valor é o mesmo da conversão acima.'
            )}
          </p>
        </div>
      )}
    </div>
  )
}

function readPct(text: string): Big | 'invalid' {
  if (text.trim() === '') return new Big(0)
  const r = parseBrazilianNumber(text.replace('%', ''))
  if (!r.ok || r.value.gt(100)) return 'invalid'
  return r.value
}

function Field(props: { id: string; label: string; value: string; onChange: (v: string) => void; invalid: boolean }) {
  return (
    <div className={s.campo}>
      <label htmlFor={props.id}>{props.label}</label>
      <div className={s.entrada}>
        <input
          id={props.id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={props.value}
          aria-invalid={props.invalid || undefined}
          onChange={(e) => props.onChange(e.target.value)}
        />
        <span aria-hidden="true">%</span>
      </div>
    </div>
  )
}
