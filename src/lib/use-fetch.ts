'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface UseFetchResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

interface State<T> {
  url: string | null
  data: T | null
  loading: boolean
  error: string | null
}

// Hook sencillo estilo SWR para endpoints GET.
// Deriva loading/data/error comparando la URL actual con la URL de la última respuesta,
// evitando así llamadas síncronas a setState dentro del efecto.
export function useFetch<T = unknown>(url: string | null): UseFetchResult<T> {
  const [state, setState] = useState<State<T>>({
    url: null,
    data: null,
    loading: false,
    error: null,
  })
  const [tick, setTick] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!url) {
      // Limpiar resultados cuando no hay URL
      abortRef.current?.abort()
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    let cancelled = false

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          throw new Error(errBody.error || `Error ${res.status}`)
        }
        return res.json()
      })
      .then((json) => {
        if (cancelled) return
        setState({ url, data: json, loading: false, error: null })
      })
      .catch((err) => {
        if (err.name === 'AbortError' || cancelled) return
        setState({ url, data: null, loading: false, error: err.message })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [url, tick])

  // Deriva loading: si la URL cambió y no tenemos respuesta para esta URL, está cargando
  const loading = url ? url !== state.url || state.loading : false
  const data = url === state.url ? state.data : null
  const error = url === state.url ? state.error : null

  return { data, loading, error, refetch }
}

// Helper para mutaciones POST/PUT/DELETE
export async function apiFetch(
  url: string,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST',
  body?: unknown
): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error || json.message || `Error ${res.status}`)
  }
  return json
}
