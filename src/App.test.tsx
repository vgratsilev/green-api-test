import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'

describe('App', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders the controlled credentials form with valid public configuration', () => {
    render(<App apiUrl="https://api.green-api.com" />)

    expect(screen.getByRole('heading', { name: 'Telegram text chat' })).toBeInTheDocument()
    expect(screen.getByLabelText('ID инстанса')).toHaveValue('')
    expect(screen.getByLabelText('API token инстанса')).toHaveValue('')
  })

  it('shows a configuration error before any chat interaction when the URL is unavailable', () => {
    vi.stubEnv('VITE_GREEN_API_URL', undefined)

    render(<App />)

    expect(screen.getByRole('alert')).toHaveTextContent('VITE_GREEN_API_URL')
    expect(screen.queryByLabelText('ID инстанса')).not.toBeInTheDocument()
  })
})
