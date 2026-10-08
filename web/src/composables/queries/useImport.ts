import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import * as api from '@/api/import'
import { keys } from './keys'

export const isRunning = (s?: string) => s === 'importing' || s === 'stopping'
export const isDone = (s?: string) => s === 'finished' || s === 'failed'

/** Polls while an import is running; once it stops the last status stays cached. */
export const useImportStatus = () =>
  useQuery({
    queryKey: keys.import.status,
    queryFn: api.getImportStatus,
    refetchInterval: (q) => (isRunning(q.state.data?.status) ? 500 : false),
    // Stale-time 0 + refetchOnMount: opening the page always shows the server's real state.
    staleTime: 0,
  })

export const useImportLogs = (enabled: () => boolean, running: () => boolean) =>
  useQuery({
    queryKey: keys.import.logs,
    queryFn: async () => (await api.getImportLogs()).split('\n').map((l) => l.replace(/\s+importer\.go:\d+:\s*/, ' *: ')),
    enabled,
    refetchInterval: () => (running() ? 1000 : false),
  })

export const useStartImport = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { params: api.ImportParams; file: File }) => api.startImport(v.params, v.file),
    onSuccess: (status) => {
      qc.setQueryData(keys.import.status, status)
      return qc.invalidateQueries({ queryKey: keys.import.logs })
    },
  })
}

export const useStopImport = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.stopImport,
    onSuccess: (status) => {
      qc.setQueryData(keys.import.status, status)
      // A cleared import ("none") has no logs; a stopping one is polled by the status query.
      return qc.invalidateQueries({ queryKey: keys.import.status })
    },
  })
}
