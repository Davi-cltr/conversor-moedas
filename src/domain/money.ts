import Big from 'big.js'

// Precisão das divisões intermediárias: muito acima do necessário para câmbio,
// de modo que o único arredondamento relevante é o final, na exibição.
Big.DP = 24
Big.RM = Big.roundHalfUp

export { Big }

export const MAX_INTEGER_DIGITS = 13
export const MAX_FRACTION_DIGITS = 8

export type ParseResult =
  | { ok: true; value: Big; /** O ponto foi lido como separador decimal (ex.: "10.5"). */ dotAsDecimal: boolean }
  | { ok: false; reason: 'empty' | 'invalid' | 'negative' | 'too-large' | 'too-many-decimals' }

/**
 * Lê um número digitado no padrão brasileiro.
 *
 * Regras, em ordem:
 * - vírgula é sempre o separador decimal; pontos antes dela são milhares
 *   e precisam formar grupos de três dígitos ("1.234,56");
 * - sem vírgula, pontos que formam grupos de três dígitos são milhares
 *   ("1.234" = mil duzentos e trinta e quatro, como no Brasil);
 * - sem vírgula, um único ponto que NÃO forma grupo de milhar é lido como
 *   decimal ("10.5", "0.25"), caso comum de valores colados de outros sites.
 *   Essa interpretação é sinalizada para a interface avisar o usuário.
 */
export function parseBrazilianNumber(input: string): ParseResult {
  const raw = input.replace(/[\s ]/g, '').replace(/^(R\$|US\$|€|£)/, '')
  if (raw === '') return { ok: false, reason: 'empty' }
  if (raw.startsWith('-') || raw.startsWith('−')) return { ok: false, reason: 'negative' }
  if (!/^[\d.,]+$/.test(raw)) return { ok: false, reason: 'invalid' }

  let intPart: string
  let fracPart = ''
  let dotAsDecimal = false
  const commaCount = raw.split(',').length - 1

  if (commaCount > 1) return { ok: false, reason: 'invalid' }

  if (commaCount === 1) {
    const [left, right] = raw.split(',')
    if (right.includes('.')) return { ok: false, reason: 'invalid' }
    const grouped = parseGroupedInteger(left === '' ? '0' : left)
    if (grouped === null) return { ok: false, reason: 'invalid' }
    intPart = grouped
    fracPart = right
  } else if (raw.includes('.')) {
    const grouped = parseGroupedInteger(raw)
    if (grouped !== null) {
      intPart = grouped
    } else {
      const pieces = raw.split('.')
      if (pieces.length !== 2) return { ok: false, reason: 'invalid' }
      intPart = pieces[0] === '' ? '0' : pieces[0]
      fracPart = pieces[1]
      dotAsDecimal = true
    }
  } else {
    intPart = raw
  }

  if (!/^\d+$/.test(intPart) || (fracPart !== '' && !/^\d+$/.test(fracPart))) {
    return { ok: false, reason: 'invalid' }
  }
  const significantInt = intPart.replace(/^0+(?=\d)/, '')
  if (significantInt.length > MAX_INTEGER_DIGITS) return { ok: false, reason: 'too-large' }
  if (fracPart.length > MAX_FRACTION_DIGITS) return { ok: false, reason: 'too-many-decimals' }

  return { ok: true, value: new Big(fracPart ? `${significantInt}.${fracPart}` : significantInt), dotAsDecimal }
}

/** "1.234.567" → "1234567"; devolve null se os grupos não forem de três dígitos. */
function parseGroupedInteger(text: string): string | null {
  if (!text.includes('.')) return /^\d+$/.test(text) ? text : null
  return /^\d{1,3}(\.\d{3})+$/.test(text) ? text.replaceAll('.', '') : null
}

const minorCache = new Map<string, number>()

/** Casas decimais convencionais da moeda (ISO 4217 via Intl): JPY 0, BRL 2… */
export function minorUnits(code: string): number {
  let d = minorCache.get(code)
  if (d === undefined) {
    d = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2
    minorCache.set(code, d)
  }
  return d
}

const formatterCache = new Map<string, Intl.NumberFormat>()
function formatter(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = formatterCache.get(key)
  if (!f) {
    f = make()
    formatterCache.set(key, f)
  }
  return f
}

type Numeric = Big | number | string

function toBig(value: Numeric): Big {
  return value instanceof Big ? value : new Big(value)
}

/**
 * Formata um valor monetário. O arredondamento (meio para cima) é feito
 * com aritmética decimal antes de chegar ao Intl, que recebe uma string
 * exata — nada passa por ponto flutuante.
 */
export function formatMoney(value: Numeric, code: string, opts: { withSymbol?: boolean } = {}): string {
  const digits = minorUnits(code)
  const rounded = toBig(value).round(digits, Big.roundHalfUp).toFixed(digits)
  const f = formatter(`money:${code}:${opts.withSymbol !== false}`, () =>
    opts.withSymbol === false
      ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code }),
  )
  return f.format(rounded as Intl.StringNumericLiteral)
}

/** Casas decimais para exibir uma taxa: 4 para taxas ≥ 1; 4 algarismos significativos abaixo disso. */
export function rateDecimals(value: Numeric): number {
  const v = toBig(value).abs()
  if (v.eq(0) || v.gte(1)) return 4
  // posição do primeiro dígito significativo depois da vírgula
  const exp = Math.floor(Math.log10(Number(v)))
  return Math.min(10, -exp + 3)
}

export function formatRate(value: Numeric, decimals: number = rateDecimals(value)): string {
  const fixed = toBig(value).round(decimals, Big.roundHalfUp).toFixed(decimals)
  const f = formatter(`rate:${decimals}`, () =>
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  )
  return f.format(fixed as Intl.StringNumericLiteral)
}

/** Número com separadores brasileiros, para preencher o campo de valor. */
export function formatPlain(value: Numeric, maxDecimals: number): string {
  const v = toBig(value)
  const fixed = v.round(maxDecimals, Big.roundHalfUp).toFixed(maxDecimals).replace(/\.?0+$/, '')
  const f = formatter(`plain:${maxDecimals}`, () =>
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals }),
  )
  return f.format((fixed === '' ? '0' : fixed) as Intl.StringNumericLiteral)
}

const MINUS = '−'

/** "+1,23%" / "−0,40%" / "0,00%". Recebe a variação já em pontos percentuais. */
export function formatPercent(value: Numeric, decimals = 2): string {
  const v = toBig(value).round(decimals, Big.roundHalfUp)
  const f = formatter(`pct:${decimals}`, () =>
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  )
  const body = f.format(v.abs().toFixed(decimals) as Intl.StringNumericLiteral)
  if (v.eq(0)) return `${body}%`
  return `${v.gt(0) ? '+' : MINUS}${body}%`
}

/** Variação absoluta com sinal: "+0,0123" / "−0,0450". */
export function formatSignedRate(value: Numeric, decimals?: number): string {
  const v = toBig(value)
  const d = decimals ?? rateDecimals(v)
  const rounded = v.round(d, Big.roundHalfUp)
  const body = formatRate(rounded.abs(), d)
  if (rounded.eq(0)) return body
  return `${rounded.gt(0) ? '+' : MINUS}${body}`
}

/** Converte `amount` usando `rate` (unidades de destino por unidade de origem), sem arredondar. */
export function convert(amount: Big, rate: Big): Big {
  return amount.times(rate)
}

/** Variação percentual de `from` para `to`, em pontos percentuais. */
export function percentChange(from: Numeric, to: Numeric): Big {
  const a = toBig(from)
  if (a.eq(0)) throw new RangeError('Variação percentual a partir de zero')
  return toBig(to).minus(a).div(a).times(100)
}

/** Direção de uma variação, para texto e ícones (nunca só cor). */
export function direction(value: Numeric): 'up' | 'down' | 'flat' {
  const v = toBig(value)
  return v.gt(0) ? 'up' : v.lt(0) ? 'down' : 'flat'
}
