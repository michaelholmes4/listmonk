/** Central query keys: one place to see (and invalidate) what's cached. */
export const keys = {
  config: ['config'] as const,
  profile: ['profile'] as const,
  about: ['about'] as const,
  lists: { all: ['lists'] as const, minimal: ['lists', 'minimal'] as const },
  subscribers: {
    all: ['subscribers'] as const,
    page: (q: unknown) => ['subscribers', 'page', q] as const,
    detail: (id: number) => ['subscribers', 'detail', id] as const,
    activity: (id: number) => ['subscribers', 'activity', id] as const,
    bounces: (id: number) => ['subscribers', 'bounces', id] as const,
  },
  dashboard: { counts: ['dashboard', 'counts'] as const, charts: ['dashboard', 'charts'] as const },
}
