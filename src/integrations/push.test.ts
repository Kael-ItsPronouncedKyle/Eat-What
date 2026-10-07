import { describe, expect, it } from 'vitest'
import { isPushSupported, toRow, urlBase64ToUint8Array } from './push'

describe('push helpers', () => {
  it('decodes a URL-safe base64 VAPID key into raw bytes', () => {
    // 'hello' in URL-safe base64 without padding.
    const bytes = urlBase64ToUint8Array('aGVsbG8')
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111])
    // '-' and '_' map to '+' and '/'.
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255])
  })

  it('turns a browser subscription into a stored row and refuses one without keys', () => {
    const sub = {
      endpoint: 'https://push.example/abc',
      toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' } }),
    }
    const row = toRow(sub, 'user-1', 'TestBrowser/1.0')
    expect(row).toMatchObject({ userId: 'user-1', endpoint: 'https://push.example/abc', p256dh: 'P', auth: 'A', userAgent: 'TestBrowser/1.0' })
    expect(row?.id).toBeTruthy()
    expect(row?.createdAt).toBe(row?.lastSeenAt)

    const bare = { endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc' }) }
    expect(toRow(bare, 'user-1', null)).toBeNull()
  })

  it('reports no push support in a browser without a PushManager', () => {
    expect(isPushSupported()).toBe(false)
  })
})
