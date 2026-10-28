import { useCallback, useEffect, useRef, useState } from 'react'
import { readCache, writeCache, type Codec } from '../api/cache'
import { isAbortError } from '../api/http'

export interface ResourceState<T> {
  data: T | null
  /** Quando o dado exibido foi obtido da fonte (ms). */
  savedAt: number | null
  error: Error | null
  /** Há uma requisição em andamento (com ou sem dado já exibido). */
  loading: boolean
  /** O dado exibido veio do cache e ainda está sendo confirmado. */
  fromCache: boolean
}

export interface ResourceOptions<T> {
  /** Idade máxima do cache antes de buscar de novo. */
  maxAgeMs: number
  /** Persistir no localStorage. */
  codec?: Codec<T>
  /** Atualização periódica enquanto a aba está visível. */
  refreshMs?: number
}

const EMPTY = { data: null, savedAt: null, error: null, loading: false, fromCache: false }

/**
 * Busca um recurso identificado por `key`.
 * - Mostra imediatamente o que houver em cache, sempre com a data de origem.
 * - Cancela a requisição anterior quando a chave muda; respostas fora de
 *   ordem nunca sobrescrevem o estado da chave atual.
 * - Em caso de erro, mantém o último dado válido e expõe o erro.
 */
export function useResource<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
  options: ResourceOptions<T>,
): ResourceState<T> & { reload: () => void } {
  const { maxAgeMs, codec, refreshMs } = options
  const loadRef = useRef(load)
  loadRef.current = load
  const codecRef = useRef(codec)
  codecRef.current = codec

  const [state, setState] = useState<ResourceState<T> & { key: string | null }>({ ...EMPTY, key: null })
  const [nonce, setNonce] = useState(0)
  const forceRef = useRef(false)

  // chave mudou: mostra o cache (se houver) antes do efeito rodar
  if (state.key !== key) {
    const cached = key ? readCache<T>(key, codec) : null
    setState({
      key,
      data: cached?.data ?? null,
      savedAt: cached?.savedAt ?? null,
      error: null,
      loading: false,
      fromCache: !!cached,
    })
  }

  useEffect(() => {
    if (!key) return
    const force = forceRef.current
    forceRef.current = false
    const cached = readCache<T>(key, codecRef.current)
    if (!force && cached && Date.now() - cached.savedAt < maxAgeMs) {
      setState((s) => (s.key === key ? { ...s, data: cached.data, savedAt: cached.savedAt, loading: false } : s))
      return
    }
    const controller = new AbortController()
    setState((s) => (s.key === key ? { ...s, loading: true, error: null } : s))
    loadRef.current(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return
        const entry = writeCache(key, data, codecRef.current)
        setState((s) =>
          s.key === key ? { key, data, savedAt: entry.savedAt, error: null, loading: false, fromCache: false } : s,
        )
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return
        setState((s) =>
          s.key === key
            ? { ...s, loading: false, error: error instanceof Error ? error : new Error(String(error)) }
            : s,
        )
      },
    )
    return () => controller.abort()
  }, [key, maxAgeMs, nonce])

  // atualização periódica, pausada com a aba em segundo plano
  useEffect(() => {
    if (!key || !refreshMs) return
    let timer: ReturnType<typeof setInterval> | undefined
    const tick = () => {
      forceRef.current = true
      setNonce((n) => n + 1)
    }
    const start = () => {
      if (timer === undefined) timer = setInterval(tick, refreshMs)
    }
    const stop = () => {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        const cached = readCache<T>(key, codecRef.current)
        if (!cached || Date.now() - cached.savedAt >= refreshMs) tick()
        start()
      } else stop()
    }
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [key, refreshMs])

  const reload = useCallback(() => {
    forceRef.current = true
    setNonce((n) => n + 1)
  }, [])

  const { key: _ignored, ...rest } = state
  void _ignored
  return { ...rest, reload }
}
