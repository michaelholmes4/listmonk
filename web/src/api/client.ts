import axios, { type AxiosRequestConfig } from 'axios'

/** Error thrown by every API call. `message` is safe to show to the user. */
export class ApiError extends Error {
  readonly status: number
  /** The response's `data`, when an error carries structured detail (e.g. publish problems). */
  readonly data?: unknown

  constructor(message: string, status: number, data?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }

  /**
   * True when the request failed for lack of a valid session. listmonk's API auth middleware
   * answers a missing/expired session cookie with 403 "invalid session" (not 401); other 403s
   * are real permission errors.
   */
  get unauthenticated(): boolean {
    return this.status === 401 || (this.status === 403 && this.message === 'invalid session')
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
    const body = err.response?.data as { message?: string; data?: unknown } | undefined

    const apiErr = new ApiError(body?.message || err.message, status, body?.data)
    // No session or session expired: go through the server-rendered login, which returns here.
    if (apiErr.unauthenticated) window.location.assign(loginURL())
    throw apiErr
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
  /** PUT url-encoded form fields (the TOTP endpoints read form values, not JSON). */
  async putForm<T>(url: string, fields: Record<string, string>, cfg?: Config): Promise<T> {
    return (await http.put<{ data: T }>(url, new URLSearchParams(fields), cfg)).data.data
  },
  async patch<T>(url: string, body?: unknown, cfg?: Config): Promise<T> {
    return (await http.patch<{ data: T }>(url, body, cfg)).data.data
  },
  async delete<T>(url: string, params?: Params, cfg?: Config): Promise<T> {
    return (await http.delete<{ data: T }>(url, { params, ...cfg })).data.data
  },
  /** DELETE with url-encoded form fields in the body. */
  async deleteForm<T>(url: string, fields: Record<string, string>, cfg?: Config): Promise<T> {
    return (await http.delete<{ data: T }>(url, { data: new URLSearchParams(fields), ...cfg })).data.data
  },
  async raw<T>(url: string, params?: Params, cfg?: Config): Promise<T> {
    return (await http.get<T>(url, { params, ...cfg })).data
  },
  /** GET an endpoint that answers with an HTML document (template and campaign previews). */
  async html(url: string, params?: Params, cfg?: Config): Promise<string> {
    return (await http.get<string>(url, { params, responseType: 'text', ...cfg })).data
  },
  /** POST url-encoded form fields to an endpoint that answers with an HTML document. */
  async postFormForHTML(url: string, fields: Record<string, string>, cfg?: Config): Promise<string> {
    return (await http.post<string>(url, new URLSearchParams(fields), { responseType: 'text', ...cfg })).data
  },
}
