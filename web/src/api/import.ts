import { api } from './client'
import type { ImportStatus } from './types'

export interface ImportParams {
  mode: 'subscribe' | 'blocklist'
  subscriptionStatus: 'unconfirmed' | 'confirmed' | 'unsubscribed'
  delim: string
  listIds: number[]
  overwriteUserInfo: boolean
  overwriteSubStatus: boolean
}

export const getImportStatus = () => api.get<ImportStatus>('/api/import/subscribers')

/** Server log of the current/last import, one string with newlines. */
export const getImportLogs = () => api.get<string>('/api/import/subscribers/logs')

export function startImport(p: ImportParams, file: File) {
  const body = new FormData()
  body.set(
    'params',
    JSON.stringify({
      mode: p.mode,
      subscription_status: p.subscriptionStatus,
      delim: p.delim,
      lists: p.listIds,
      overwrite_userinfo: p.overwriteUserInfo,
      overwrite_subscription_status: p.overwriteSubStatus,
    }),
  )
  body.set('file', file)
  return api.post<ImportStatus>('/api/import/subscribers', body)
}

/** Stops a running import, or clears a finished one so a new import can start. */
export const stopImport = () => api.delete<ImportStatus>('/api/import/subscribers')
