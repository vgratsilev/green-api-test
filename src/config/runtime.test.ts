import { describe, expect, it } from 'vitest'

import { getRuntimeConfig } from './runtime'

describe('getRuntimeConfig', () => {
  it('returns the public HTTPS GREEN-API URL', () => {
    expect(getRuntimeConfig('https://api.green-api.com')).toEqual({
      apiUrl: 'https://api.green-api.com',
    })
  })

  it('rejects a missing or non-HTTPS URL without using credentials', () => {
    expect(getRuntimeConfig()).toEqual({
      error: 'Укажите публичный HTTPS-адрес API GREEN-API в VITE_GREEN_API_URL.',
    })
    expect(getRuntimeConfig('http://api.green-api.com')).toEqual({
      error: 'Укажите публичный HTTPS-адрес API GREEN-API в VITE_GREEN_API_URL.',
    })
  })
})
