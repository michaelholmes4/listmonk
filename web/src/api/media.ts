import { api } from './client'
import type { MediaFile, Paginated } from './types'

export interface MediaQuery {
  query?: string
  page: number
  perPage?: number
}

export const queryMedia = (q: MediaQuery, signal?: AbortSignal) =>
  api.get<Paginated<MediaFile>>('/api/media', { query: q.query || undefined, page: q.page, per_page: q.perPage }, { signal })

export function uploadMedia(file: File) {
  const body = new FormData()
  body.set('file', file)
  return api.post<MediaFile>('/api/media', body)
}

export const deleteMedia = (id: number) => api.delete<boolean>(`/api/media/${id}`)
