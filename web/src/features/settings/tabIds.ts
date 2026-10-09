export const tabs = ['general', 'performance', 'privacy', 'security', 'media', 'smtp', 'bounces', 'messengers', 'appearance'] as const
export type SettingsTab = (typeof tabs)[number]

// The `app` section is split over two tabs.
const PERFORMANCE_KEYS = new Set([
  'batch_size', 'concurrency', 'max_send_errors', 'message_rate', 'cache_slow_queries', 'cache_slow_queries_interval',
  'message_sliding_window', 'message_sliding_window_duration', 'message_sliding_window_rate',
])

/** Which tab shows the field at a form path such as `smtp[0].host` or `app.batch_size`. */
export function tabOfPath(path: string): SettingsTab {
  const [root, second] = path.split(/[.[]/)
  switch (root) {
    case 'app':
      return PERFORMANCE_KEYS.has(second) ? 'performance' : 'general'
    case 'privacy':
      return 'privacy'
    case 'security':
      return 'security'
    case 'upload':
      return 'media'
    case 'smtp':
      return 'smtp'
    case 'bounce':
      return 'bounces'
    case 'messengers':
      return 'messengers'
    case 'appearance':
      return 'appearance'
    default:
      return 'general'
  }
}

/** i18n key of each section's name (the sidebar's Settings space and the page title). */
export const tabLabels: Record<SettingsTab, string> = {
  general: 'settings.general.name',
  performance: 'settings.performance.name',
  privacy: 'settings.privacy.name',
  security: 'settings.security.name',
  media: 'settings.media.title',
  smtp: 'settings.smtp.name',
  bounces: 'settings.bounces.name',
  messengers: 'settings.messengers.name',
  appearance: 'settings.appearance.name',
}

/** The section a `?tab=` query value names; General when it names none. */
export const tabOfQuery = (q: unknown): SettingsTab => (tabs.includes(q as SettingsTab) ? (q as SettingsTab) : 'general')
