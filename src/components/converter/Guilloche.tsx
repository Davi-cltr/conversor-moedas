import { memo, useMemo } from 'react'
import { sealFor } from './sealGeometry'

/**
 * Selo guilhoché — o desenho de linhas entrelaçadas das cédulas.
 * Os parâmetros da curva (hipotrocoide) saem do par de moedas, então cada
 * par tem um selo próprio e estável: USD/BRL nunca muda de desenho, e
 * inverter o par gira o mesmo selo em vez de trocá-lo.
 */

interface Props {
  from: string
  to: string
  /** Rotação acumulada (graus) — cresce a cada inversão. */
  rotation: number
  className?: string
}

export const Guilloche = memo(function Guilloche({ from, to, rotation, className }: Props) {
  const spec = useMemo(() => sealFor(from, to), [from, to])
  return (
    <svg className={className} viewBox="-60 -60 120 120" aria-hidden="true" focusable="false">
      <circle r="57" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      <circle r="53.5" fill="none" stroke="currentColor" strokeWidth="0.35" opacity="0.35" strokeDasharray="0.6 1.4" />
      <g style={{ transform: `rotate(${rotation}deg)` }} data-seal-rotor="">
        {spec.paths.map((p, i) => (
          <path key={i} d={p.d} fill="none" stroke="currentColor" strokeWidth="0.42" opacity={p.opacity} />
        ))}
      </g>
    </svg>
  )
})
