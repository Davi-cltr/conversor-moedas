/** Geometria do selo guilhoché (hipotrocoides), separada do componente para testes. */

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/** Hipotrocoide: pequeno círculo de raio r rolando dentro de um de raio R. */
function hypotrochoid(R: number, r: number, d: number, scale: number, steps: number): string {
  const turns = r / gcd(R, r)
  const total = Math.PI * 2 * turns
  const k = (R - r) / r
  let path = ''
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * total
    const x = (R - r) * Math.cos(t) + d * Math.cos(k * t)
    const y = (R - r) * Math.sin(t) - d * Math.sin(k * t)
    path += `${i === 0 ? 'M' : 'L'}${(x * scale).toFixed(2)} ${(y * scale).toFixed(2)}`
  }
  return path + 'Z'
}

export interface SealSpec {
  paths: { d: string; opacity: number }[]
}

export function sealFor(a: string, b: string): SealSpec {
  // ordem canônica: o par invertido tem o mesmo selo
  const [x, y] = [a, b].sort()
  const h = hash(`${x}/${y}`)
  const R = 9 + (h % 5) // 9..13
  const r = 2 + ((h >>> 3) % (R - 4)) // pétalas
  const rr = r === R / 2 ? r + 1 : r
  const base = 46 / (R - rr + rr * 1.1)
  const layers = [0.55, 0.85, 1.15].map((f, i) => ({
    d: hypotrochoid(R, rr, rr * f, base * (1 - i * 0.12), 900),
    opacity: 0.85 - i * 0.22,
  }))
  return { paths: layers }
}
