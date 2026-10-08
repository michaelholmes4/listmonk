/** Central query keys: one place to see (and invalidate) what's cached. */
export const keys = {
  config: ['config'] as const,
  profile: ['profile'] as const,
  about: ['about'] as const,
  lists: {
    all: ['lists'] as const,
    minimal: ['lists', 'minimal'] as const,
    page: (q: unknown) => ['lists', 'page', q] as const,
    detail: (id: number) => ['lists', 'detail', id] as const,
  },
  subscribers: {
    all: ['subscribers'] as const,
    page: (q: unknown) => ['subscribers', 'page', q] as const,
    detail: (id: number) => ['subscribers', 'detail', id] as const,
    activity: (id: number) => ['subscribers', 'activity', id] as const,
    bounces: (id: number) => ['subscribers', 'bounces', id] as const,
  },
  import: { status: ['import', 'status'] as const, logs: ['import', 'logs'] as const },
  bounces: { all: ['bounces'] as const, page: (q: unknown) => ['bounces', 'page', q] as const },
  templates: { all: ['templates'] as const, detail: (id: number) => ['templates', 'detail', id] as const },
  media: { all: ['media'] as const, page: (q: unknown) => ['media', 'page', q] as const },
  campaigns: {
    all: ['campaigns'] as const,
    page: (q: unknown) => ['campaigns', 'page', q] as const,
    detail: (id: number) => ['campaigns', 'detail', id] as const,
    running: ['campaigns', 'running'] as const,
  },
  dashboard: { counts: ['dashboard', 'counts'] as const, charts: ['dashboard', 'charts'] as const },
}
