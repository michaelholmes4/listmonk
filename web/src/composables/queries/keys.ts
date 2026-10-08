/** Central query keys: one place to see (and invalidate) what's cached. */
export const keys = {
  config: ['config'] as const,
  profile: ['profile'] as const,
  about: ['about'] as const,
  dashboard: { counts: ['dashboard', 'counts'] as const },
}
