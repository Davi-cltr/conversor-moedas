/**
 * Cache em duas camadas: memória (sessão) e localStorage (entre visitas).
 * Cada entrada guarda quando foi salva, para a interface sempre dizer de
 * quando é o dado exibido. Nunca devolve dado sem essa data.
 */

export interface CacheEntry<T> {
  data: T
  savedAt: number
}

const PREFIX = 'lastro:v1:'
const memory = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export interface Codec<T> {
  encode: (data: T) => unknown
  decode: (raw: unknown) => T | null
}

export function readCache<T>(key: string, codec?: Codec<T>): CacheEntry<T> | null {
  const hit = memory.get(key) as CacheEntry<T> | undefined
  if (hit) return hit
  if (!codec) return null
  try {
    const raw = storage()?.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt?: unknown; data?: unknown }
    if (typeof parsed.savedAt !== 'number') return null
    const data = codec.decode(parsed.data)
    if (data === null) return null
    const entry = { data, savedAt: parsed.savedAt }
    memory.set(key, entry)
    return entry
  } catch {
    return null
  }
}

export function writeCache<T>(key: string, data: T, codec?: Codec<T>, savedAt = Date.now()): CacheEntry<T> {
  const entry = { data, savedAt }
  memory.set(key, entry)
  if (codec) {
    try {
      storage()?.setItem(PREFIX + key, JSON.stringify({ savedAt, data: codec.encode(data) }))
    } catch {
      // armazenamento cheio ou bloqueado: o cache de memória continua valendo
    }
  }
  return entry
}

interface Inflight {
  promise: Promise<unknown>
  controller: AbortController
  refs: number
}

/**
 * Junta pedidos idênticos simultâneos numa única requisição. A requisição
 * de rede só é cancelada quando todos os interessados desistem.
 */
export function shared<T>(key: string, run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException('Cancelado', 'AbortError'))
  let entry = inflight.get(key) as Inflight | undefined
  if (!entry) {
    const controller = new AbortController()
    const created: Inflight = { controller, refs: 0, promise: Promise.resolve() }
    created.promise = run(controller.signal).finally(() => {
      if (inflight.get(key) === created) inflight.delete(key)
    })
    entry = created
    inflight.set(key, entry)
  }
  const current = entry
  current.refs++
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const onAbort = () => {
      if (settled) return
      settled = true
      current.refs--
      if (current.refs <= 0) {
        current.controller.abort()
        if (inflight.get(key) === current) inflight.delete(key)
      }
      reject(new DOMException('Cancelado', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    ;(current.promise as Promise<T>).then(
      (v) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (e) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onAbort)
        reject(e)
      },
    )
  })
}

/** Só para testes. */
export function clearCache(): void {
  memory.clear()
  inflight.clear()
  const s = storage()
  if (!s) return
  for (let i = s.length - 1; i >= 0; i--) {
    const k = s.key(i)
    if (k?.startsWith(PREFIX)) s.removeItem(k)
  }
}
