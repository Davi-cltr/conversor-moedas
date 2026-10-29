import { BASE_CURRENCY, getCurrency } from './currencies'

/** O histórico sempre mostra "quanto vale 1 unidade estrangeira", que é como se lê câmbio no Brasil. */
export function orientPair(from: string, to: string): { base: string; quote: string } | null {
  if (from === to) return null
  if (to === BASE_CURRENCY) return { base: from, quote: BASE_CURRENCY }
  if (from === BASE_CURRENCY) return { base: to, quote: BASE_CURRENCY }
  return { base: from, quote: to }
}

export function pairTitle(base: string, quote: string): string {
  const b = getCurrency(base)?.name.toLowerCase() ?? base
  const q = quote === BASE_CURRENCY ? 'reais' : (getCurrency(quote)?.name.toLowerCase() ?? quote)
  return `Quanto valeu 1 ${b} em ${q}`
}
