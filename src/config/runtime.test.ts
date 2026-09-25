import { afterEach, describe, expect, it, vi } from 'vitest'

import { getRuntimeConfig } from './runtime'

describe('getRuntimeConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the public HTTPS GREEN-API URL', () => {
    expect(getRuntimeConfig('https://api.green-api.com')).toEqual({
      apiUrl: 'https://api.green-api.com',
    })
  })

  it('rejects a missing or non-HTTPS URL without using credentials', () => {
    vi.stubEnv('VITE_GREEN_API_URL', undefined)

    expect(getRuntimeConfig()).toEqual({
      error: 'Укажите публичный HTTPS-адрес API GREEN-API в VITE_GREEN_API_URL.',
    })
    expect(getRuntimeConfig('http://api.green-api.com')).toEqual({
      error: 'Укажите публичный HTTPS-адрес API GREEN-API в VITE_GREEN_API_URL.',
    })
  })
})
