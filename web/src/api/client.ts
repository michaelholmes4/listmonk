import axios, { type AxiosRequestConfig } from 'axios'

/** Error thrown by every API call. `message` is safe to show to the user. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// The app uses the session cookie from the (server-rendered) login page, same as the old UI.
const http = axios.create({
  baseURL: '/',
  headers: { Accept: 'application/json' },
  // listmonk expects repeated keys for arrays (id=1&id=2), not id[]=1.
  paramsSerializer: {
    serialize: (params: Record<string, unknown>) => {
      const q = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue
        for (const item of Array.isArray(v) ? v : [v]) q.append(k, String(item))
      }
      return q.toString()
    },
  },
})

export function loginURL(): string {
  const next = encodeURIComponent(window.location.pathname + window.location.search)
  return `/admin/login?next=${next}`
}

http.interceptors.response.use(
  (resp) => resp,
  (err: unknown) => {
    if (!axios.isAxiosError(err)) throw err

    const status = err.response?.status ?? 0
    // Session expired mid-use: go through the server-rendered login, which returns here.
    if (status === 401) window.location.assign(loginURL())

    const body = err.response?.data as { message?: string } | undefined
    throw new ApiError(body?.message || err.message, status)
  },
)

type Params = Record<string, unknown>
type Config = Pick<AxiosRequestConfig, 'signal' | 'headers'>

/**
 * Typed helpers. Most listmonk endpoints wrap the payload as `{data: ...}`; these return the
 * unwrapped payload. Use `raw` for the few endpoints that don't (e.g. /api/about).
 */
export const api = {
  async get<T>(url: string, params?: Params, cfg?: Config): Promise<T> {
    return (await http.get<{ data: T }>(url, { params, ...cfg })).data.data
  },
  async post<T>(url: string, body?: unknown, cfg?: Config): Promise<T> {
    return (await http.post<{ data: T }>(url, body, cfg)).data.data
  },
  async put<T>(url: string, body?: unknown, cfg?: Config): Promise<T> {
    return (await http.put<{ data: T }>(url, body, cfg)).data.data
  },
  async patch<T>(url: string, body?: unknown, cfg?: Config): Promise<T> {
    return (await http.patch<{ data: T }>(url, body, cfg)).data.data
  },
  async delete<T>(url: string, params?: Params, cfg?: Config): Promise<T> {
    return (await http.delete<{ data: T }>(url, { params, ...cfg })).data.data
  },
  async raw<T>(url: string, params?: Params, cfg?: Config): Promise<T> {
    return (await http.get<T>(url, { params, ...cfg })).data
  },
}
