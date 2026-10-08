import { api } from './client'
import type { LanguagePack, ServerConfig } from './types'

export const getServerConfig = () => api.get<ServerConfig>('/api/config')

export const getLanguagePack = (lang: string) => api.get<LanguagePack>(`/api/lang/${lang}`)
