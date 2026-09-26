import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ConnectionForm } from './ConnectionForm'

describe('ConnectionForm', () => {
  it('formats an international number and detects its country without a manual selection', () => {
    render(<ConnectionForm onConnect={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79029021456' } })

    expect(screen.getByLabelText('Номер получателя')).toHaveValue('+7 902 902 14 56')
    expect(screen.getByRole('combobox', { name: 'Страна' }).querySelector('img')).toHaveAttribute(
      'src',
      'https://flagcdn.com/w40/ru.png',
    )
  })

  it('clears the international-format error when the recipient number is corrected', () => {
    render(<ConnectionForm onConnect={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'token' } })
    fireEvent.click(screen.getByRole('combobox', { name: 'Страна' }))
    fireEvent.click(screen.getByRole('option', { name: /Россия/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Введите номер в международном формате.')

    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
