export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'rate-limit' | 'not-found' | 'invalid'

/** Falha de uma fonte de dados, já classificada para a interface explicar. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly source: string

  constructor(kind: ApiErrorKind, source: string, message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.source = source
    this.status = status
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export interface GetJsonOptions {
  signal?: AbortSignal
  timeoutMs?: number
  /** Nome da fonte, usado nas mensagens de erro. */
  source: string
  fetchImpl?: typeof fetch
}

/**
 * GET com timeout e cancelamento. Cancelamento pelo chamador propaga um
 * AbortError (que a interface ignora); o resto vira ApiError.
 */
export async function getJson(url: string, opts: GetJsonOptions): Promise<unknown> {
  const { signal, timeoutMs = 15_000, source, fetchImpl = fetch } = opts
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', onAbort, { once: true })

  try {
    let response: Response
    try {
      response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    } catch (error) {
      if (timedOut) throw new ApiError('timeout', source, `${source} demorou demais para responder.`)
      if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
      throw new ApiError('network', source, `Não foi possível conectar à ${source}.`)
    }

    if (response.status === 429) {
      throw new ApiError('rate-limit', source, `A ${source} limitou o número de consultas. Tente de novo em alguns minutos.`, 429)
    }
    if (response.status === 404) {
      throw new ApiError('not-found', source, `A ${source} não tem esses dados.`, 404)
    }
    if (!response.ok) {
      throw new ApiError('http', source, `A ${source} respondeu com erro ${response.status}.`, response.status)
    }

    try {
      return await response.json()
    } catch {
      if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
      throw new ApiError('invalid', source, `A ${source} enviou uma resposta ilegível.`)
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Lê uma string numérica positiva ("5.3533") ou devolve null. */
export function readPositiveNumeric(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(value)
  if (typeof value === 'string' && /^\d+(\.\d+)?(e-?\d+)?$/i.test(value.trim()) && Number(value) > 0) return value.trim()
  return null
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
