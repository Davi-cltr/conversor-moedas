/**
 * Moedas suportadas. Todas têm cotação comercial via AwesomeAPI (par XXX-BRL).
 * `history` indica de onde vem o histórico diário:
 *  - 'ptax': PTAX de fechamento do Banco Central (oficial, dias úteis);
 *  - 'awesome': fechamento comercial diário da AwesomeAPI (até 360 dias por consulta);
 *  - 'base': o próprio real, que vale 1 em todas as séries.
 */

export type HistorySource = 'ptax' | 'awesome' | 'base'

export interface Currency {
  code: string
  name: string
  /** Onde a moeda circula — ajuda a distinguir os vários "dólares" e "pesos". */
  region: string
  history: HistorySource
  /** Termos extras para a busca (sem acento, minúsculos). */
  aliases?: string[]
  /** Grupo de exibição no seletor. */
  group: 'principal' | 'mais'
}

export const BASE_CURRENCY = 'BRL'

export const CURRENCIES: readonly Currency[] = [
  { code: 'BRL', name: 'Real brasileiro', region: 'Brasil', history: 'base', group: 'principal', aliases: ['reais'] },
  { code: 'USD', name: 'Dólar americano', region: 'Estados Unidos', history: 'ptax', group: 'principal', aliases: ['dolar', 'eua'] },
  { code: 'EUR', name: 'Euro', region: 'Zona do euro', history: 'ptax', group: 'principal', aliases: ['europa'] },
  { code: 'GBP', name: 'Libra esterlina', region: 'Reino Unido', history: 'ptax', group: 'principal', aliases: ['libra', 'inglaterra'] },
  { code: 'JPY', name: 'Iene japonês', region: 'Japão', history: 'ptax', group: 'principal', aliases: ['iene', 'yen'] },
  { code: 'CAD', name: 'Dólar canadense', region: 'Canadá', history: 'ptax', group: 'principal', aliases: ['dolar'] },
  { code: 'AUD', name: 'Dólar australiano', region: 'Austrália', history: 'ptax', group: 'principal', aliases: ['dolar'] },
  { code: 'CHF', name: 'Franco suíço', region: 'Suíça', history: 'ptax', group: 'principal', aliases: ['franco'] },
  { code: 'DKK', name: 'Coroa dinamarquesa', region: 'Dinamarca', history: 'ptax', group: 'mais', aliases: ['coroa'] },
  { code: 'NOK', name: 'Coroa norueguesa', region: 'Noruega', history: 'ptax', group: 'mais', aliases: ['coroa'] },
  { code: 'SEK', name: 'Coroa sueca', region: 'Suécia', history: 'ptax', group: 'mais', aliases: ['coroa'] },
  { code: 'ARS', name: 'Peso argentino', region: 'Argentina', history: 'awesome', group: 'mais', aliases: ['peso'] },
  { code: 'CLP', name: 'Peso chileno', region: 'Chile', history: 'awesome', group: 'mais', aliases: ['peso'] },
  { code: 'UYU', name: 'Peso uruguaio', region: 'Uruguai', history: 'awesome', group: 'mais', aliases: ['peso'] },
  { code: 'PYG', name: 'Guarani paraguaio', region: 'Paraguai', history: 'awesome', group: 'mais', aliases: ['guarani'] },
  { code: 'BOB', name: 'Boliviano', region: 'Bolívia', history: 'awesome', group: 'mais' },
  { code: 'PEN', name: 'Sol peruano', region: 'Peru', history: 'awesome', group: 'mais', aliases: ['sol'] },
  { code: 'COP', name: 'Peso colombiano', region: 'Colômbia', history: 'awesome', group: 'mais', aliases: ['peso'] },
  { code: 'MXN', name: 'Peso mexicano', region: 'México', history: 'awesome', group: 'mais', aliases: ['peso'] },
  { code: 'CNY', name: 'Iuan chinês', region: 'China', history: 'awesome', group: 'mais', aliases: ['yuan', 'renminbi', 'iuane'] },
]

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]))

export function getCurrency(code: string): Currency | undefined {
  return BY_CODE.get(code)
}

export function isSupported(code: string): boolean {
  return BY_CODE.has(code)
}

/** Códigos consultados na AwesomeAPI (todos exceto o real). */
export const QUOTED_CODES = CURRENCIES.filter((c) => c.code !== BASE_CURRENCY).map((c) => c.code)

export const PTAX_CODES = CURRENCIES.filter((c) => c.history === 'ptax').map((c) => c.code)

/** Fonte de histórico de um par: PTAX só quando as duas pontas são PTAX (ou real). */
export function pairHistorySource(a: string, b: string): 'ptax' | 'awesome' {
  const sa = getCurrency(a)?.history
  const sb = getCurrency(b)?.history
  return sa !== 'awesome' && sb !== 'awesome' ? 'ptax' : 'awesome'
}

export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Busca por código, nome, região ou apelido; código exato vem primeiro. */
export function searchCurrencies(query: string, list: readonly Currency[] = CURRENCIES): Currency[] {
  const q = normalizeSearch(query)
  if (!q) return [...list]
  const scored: { c: Currency; score: number }[] = []
  for (const c of list) {
    const code = c.code.toLowerCase()
    const haystack = [c.name, c.region, ...(c.aliases ?? [])].map(normalizeSearch)
    let score = -1
    if (code === q) score = 0
    else if (code.startsWith(q)) score = 1
    else if (haystack.some((h) => h.startsWith(q))) score = 2
    else if (haystack.some((h) => h.split(/\s+/).some((w) => w.startsWith(q)))) score = 3
    else if (haystack.some((h) => h.includes(q))) score = 4
    if (score >= 0) scored.push({ c, score })
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.c)
}

const symbolCache = new Map<string, string>()

/** Símbolo local em pt-BR (US$, CA$, €…). Quando o Intl só conhece o código, devolve o código. */
export function currencySymbol(code: string): string {
  let s = symbolCache.get(code)
  if (s === undefined) {
    const parts = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code }).formatToParts(0)
    s = parts.find((p) => p.type === 'currency')?.value ?? code
    symbolCache.set(code, s)
  }
  return s
}
