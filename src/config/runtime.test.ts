import { afterEach, describe, expect, it, vi } from 'vitest'

import { getRuntimeConfig, normalizeApiUrl } from './runtime'

describe('getRuntimeConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('provides the documented public GREEN-API origin as a form default', () => {
    expect(getRuntimeConfig()).toEqual({ defaultApiUrl: 'https://api.green-api.com' })
  })

  it.each([
    ['https://4100.api.green-api.com/', 'https://4100.api.green-api.com'],
    ['https://api.green-api.com', 'https://api.green-api.com'],
  ])('normalizes a public HTTPS origin: %s', (value, expected) => {
    expect(normalizeApiUrl(value)).toBe(expected)
  })

  it.each([
    '',
    'http://api.green-api.com',
    'https://user:password@api.green-api.com',
    'https://api.green-api.com/path',
    'https://api.green-api.com?query=value',
    'not a URL',
  ])('rejects an invalid API origin: %s', (value) => {
    expect(normalizeApiUrl(value)).toBeUndefined()
  })
})
