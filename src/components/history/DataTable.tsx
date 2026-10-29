import { useState } from 'react'
import { formatDate } from '../../domain/dates'
import { direction, formatPercent, formatRate, percentChange } from '../../domain/money'
import type { Point } from '../../domain/series'
import s from './DataTable.module.css'

/**
 * Alternativa textual ao gráfico: todos os valores, do mais recente ao mais
 * antigo. A tabela só é montada quando aberta (períodos longos têm milhares de linhas).
 */
export function DataTable({ points, label }: { points: readonly Point[]; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <details className={s.detalhes} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="botao-texto">Ver os {points.length} valores em tabela</summary>
      {open && <Rows points={points} label={label} />}
    </details>
  )
}

function Rows({ points, label }: { points: readonly Point[]; label: string }) {
  const rows = [...points].reverse()
  return (
    <div className={s.rolagem} tabIndex={0} role="region" aria-label={`Tabela: ${label}`}>
      <table className={s.tabela}>
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Cotação</th>
            <th scope="col">Variação desde a anterior</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const prev = rows[i + 1]
            const pct = prev ? percentChange(prev.value, p.value) : null
            return (
              <tr key={p.date}>
                <th scope="row">{formatDate(p.date)}</th>
                <td className="num">{formatRate(p.value)}</td>
                <td className={pct ? `num var-${direction(pct)}` : 'num'}>{pct ? formatPercent(pct) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
