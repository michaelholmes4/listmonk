import { api } from './client'
import type { Settings, SettingsSaved, SMTPTestRequest } from './types'

export const getSettings = () => api.get<Settings>('/api/settings')

/** `true` when the app is reloading itself, `{ needs_restart }` when running campaigns prevent that. */
export const updateSettings = (body: Settings) => api.put<SettingsSaved>('/api/settings', body)

export const updateSettingsByKey = (key: string, value: unknown) => api.put<SettingsSaved>(`/api/settings/${key}`, value)

/** Sends a test message through the given (unsaved) SMTP block; resolves with the server log tail. */
export const testSMTP = (body: SMTPTestRequest) => api.post<string[]>('/api/settings/smtp/test', body)

/** Asks the app to restart (used when settings were saved while campaigns were running). */
export const reloadApp = () => api.post<boolean>('/api/admin/reload')

export const getHealth = () => api.get<boolean>('/api/health')

export const getLogs = () => api.get<string[]>('/api/logs')
