import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CountryCombobox } from './CountryCombobox'

describe('CountryCombobox', () => {
  it('selects a country and closes the menu', () => {
    const onChange = vi.fn()

    render(<CountryCombobox country={undefined} onChange={onChange} />)

    fireEvent.click(screen.getByRole('combobox', { name: 'Страна' }))
    fireEvent.click(screen.getByRole('option', { name: /Россия/ }))

    expect(onChange).toHaveBeenCalledWith('RU')
    expect(screen.getByRole('combobox', { name: 'Страна' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('focuses the selected country when the menu opens', () => {
    render(<CountryCombobox country="RU" onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('combobox', { name: 'Страна' }))

    expect(screen.getByRole('option', { name: /Россия/ })).toHaveFocus()
  })

  it('closes the menu on Escape and outside pointer down', () => {
    render(<CountryCombobox country={undefined} onChange={vi.fn()} />)

    const combobox = screen.getByRole('combobox', { name: 'Страна' })
    fireEvent.click(combobox)
    fireEvent.keyDown(combobox, { key: 'Escape' })
    expect(combobox).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(combobox)
    fireEvent.pointerDown(document.body)
    expect(combobox).toHaveAttribute('aria-expanded', 'false')
  })
})
