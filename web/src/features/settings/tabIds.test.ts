import { describe, expect, it } from 'vitest'
import { tabOfPath } from './tabIds'

describe('tabOfPath', () => {
  it('sends each form path to the tab that shows it', () => {
    expect(tabOfPath('app.site_name')).toBe('general')
    expect(tabOfPath('app.batch_size')).toBe('performance')
    expect(tabOfPath('app.message_sliding_window_rate')).toBe('performance')
    expect(tabOfPath('smtp[0].host')).toBe('smtp')
    expect(tabOfPath('smtp.0.host')).toBe('smtp')
    expect(tabOfPath('bounce.mailboxes[0].host')).toBe('bounces')
    expect(tabOfPath('upload.s3.url')).toBe('media')
    expect(tabOfPath('security.oidc.client_id')).toBe('security')
  })
})
