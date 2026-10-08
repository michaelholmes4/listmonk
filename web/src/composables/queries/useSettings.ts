import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { toast } from 'vue-sonner'
import * as api from '@/api/settings'
import type { Settings, SettingsSaved, SMTPTestRequest } from '@/api/types'
import { needsRestart, waitForReload, type SaveOutcome } from '@/features/settings/restart'
import { i18n } from '@/i18n'
import { keys } from './keys'

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: api.getSettings, staleTime: 0, gcTime: 0 })

/**
 * Saving settings reloads the server. Unless campaigns are running (then the app only flags that a
 * restart is needed), wait for it to come back and refresh what depends on the configuration.
 */
function useSaveMutation<TVars>(save: (v: TVars) => Promise<SettingsSaved>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: TVars): Promise<SaveOutcome> => {
      const saved = await save(v)
      if (needsRestart(saved)) {
        await qc.invalidateQueries({ queryKey: keys.config })
        return 'needs-restart'
      }
      toast.success(i18n.global.t('settings.messengers.messageSaved'))
      await waitForReload()
      await Promise.all([qc.invalidateQueries({ queryKey: keys.config }), qc.invalidateQueries({ queryKey: keys.settings })])
      return 'reloaded'
    },
  })
}

export const useSaveSettings = () => useSaveMutation((b: Settings) => api.updateSettings(b))
export const useSaveSettingsKey = () => useSaveMutation((v: { key: string; value: unknown }) => api.updateSettingsByKey(v.key, v.value))

export const useTestSMTP = () => useMutation({ mutationFn: (b: SMTPTestRequest) => api.testSMTP(b) })

export const useRestartApp = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await api.reloadApp()
      await waitForReload()
      await qc.invalidateQueries({ queryKey: keys.config })
    },
  })
}
