// Friendly aliases over the generated OpenAPI types (schema.d.ts, from docs/swagger).
// Regenerate with `pnpm gen:api`; fix gaps in the spec, never by hand-writing types here.
import type { components } from './schema'

export type Schemas = components['schemas']

export type ServerConfig = Schemas['ServerConfig']
export type User = Schemas['User']
export type About = Schemas['About']
export type DashboardCount = Schemas['DashboardCount']
export type DashboardChart = Schemas['DashboardChart']

/** A language pack is a flat key -> message map (the spec types every key; this is simpler). */
export type LanguagePack = Record<string, string>

/** Shape of paginated list endpoints (`data` of e.g. GET /api/subscribers). */
export interface Paginated<T> {
  results: T[]
  query: string
  total: number
  per_page: number
  page: number
}

export type Subscriber = Schemas['Subscriber']
export type SubscriberList = NonNullable<Subscriber['lists']>[number]
export type NewSubscriber = Schemas['NewSubscriber']
export type SubscriberActivity = Schemas['SubscriberActivity']
export type BounceRecord = Schemas['BounceRecord']
export type SubscriberBulkRequest = Schemas['SubscriberQueryRequest']
export type List = Schemas['List']
export type NewList = Schemas['NewList']
