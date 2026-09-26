import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import { createGreenApiClient, GreenApiError } from './api/greenApi'

vi.mock('./api/greenApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/greenApi')>()
  return { ...actual, createGreenApiClient: vi.fn() }
})

const sendMessage = vi.fn()
const getContactInfo = vi.fn()
const getAvatar = vi.fn()
const receiveNotification = vi.fn()
const deleteNotification = vi.fn()

function arrangeClient() {
  getContactInfo.mockResolvedValue({})
  getAvatar.mockResolvedValue({ available: false })
  vi.mocked(createGreenApiClient).mockReturnValue({
    sendMessage,
    getContactInfo,
    getAvatar,
    receiveNotification,
    deleteNotification,
  })
}

function chooseCountry(country: string) {
  const countryNames: Record<string, RegExp> = {
    RU: /Россия/,
    US: /Соединенные Штаты/,
    UZ: /Узбекистан/,
  }

  fireEvent.click(screen.getByRole('combobox', { name: 'Страна' }))
  fireEvent.click(screen.getByRole('option', { name: countryNames[country] }))
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('renders the controlled credentials form with valid public configuration', () => {
    render(<App apiUrl="https://api.green-api.com" />)

    expect(screen.getByRole('heading', { name: 'Telegram text chat' })).toBeInTheDocument()
    expect(screen.getByLabelText('ID инстанса')).toHaveValue('')
    expect(screen.getByLabelText('API token инстанса')).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Страна' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows a configuration error before any chat interaction when the URL is unavailable', () => {
    vi.stubEnv('VITE_GREEN_API_URL', undefined)

    render(<App />)

    expect(screen.getByRole('alert')).toHaveTextContent('VITE_GREEN_API_URL')
    expect(screen.queryByLabelText('ID инстанса')).not.toBeInTheDocument()
  })

  it('formats Russian and international recipient phone numbers while typing', () => {
    render(<App apiUrl="https://api.green-api.com" />)

    const phoneInput = screen.getByLabelText('Номер получателя')
    chooseCountry('RU')
    expect(phoneInput).toHaveValue('+7')
    expect(screen.getByRole('combobox', { name: 'Страна' }).querySelector('img')).toHaveAttribute(
      'src',
      'https://flagcdn.com/w40/ru.png',
    )

    fireEvent.change(phoneInput, { target: { value: '+79951234567' } })
    expect(phoneInput).toHaveValue('+7 995 123 45 67')

    fireEvent.change(phoneInput, { target: { value: '+793938373888888' } })
    expect(phoneInput).toHaveValue('+7 995 123 45 67')

    fireEvent.change(phoneInput, { target: { value: '+7 995 123 45 6' } })
    expect(phoneInput).toHaveValue('+7 995 123 45 6')

    fireEvent.change(phoneInput, { target: { value: '' } })
    expect(phoneInput).toHaveValue('+7')

    chooseCountry('UZ')
    expect(phoneInput).toHaveValue('+998')
    fireEvent.change(phoneInput, { target: { value: '+998901234567' } })
    expect(phoneInput).toHaveValue('+998 90 123 45 67')

    chooseCountry('US')
    expect(phoneInput).toHaveValue('+1')
    fireEvent.change(phoneInput, { target: { value: '+12125551234' } })
    expect(phoneInput).toHaveValue('+1 212 555 1234')
  })

  it('keeps the country code when the phone input is cleared', () => {
    render(<App apiUrl="https://api.green-api.com" />)

    const phoneInput = screen.getByLabelText('Номер получателя')
    chooseCountry('RU')
    fireEvent.change(phoneInput, { target: { value: '' } })

    expect(phoneInput).toHaveValue('+7')
  })

  it('shows the contact-book name in the chat header when GREEN-API returns it', async () => {
    arrangeClient()
    getContactInfo.mockResolvedValue({ contactName: 'Василиса Премудрая', name: 'Василиса' })
    receiveNotification.mockImplementation(() => new Promise(() => {}))

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    expect(await screen.findByRole('heading', { name: 'Василиса Премудрая' })).toBeInTheDocument()
    expect(getContactInfo).toHaveBeenCalledWith(
      { instanceId: '123', apiToken: 'secret' },
      '79991234567@c.us',
      expect.any(AbortSignal),
    )
  })

  it('shows an available contact avatar', async () => {
    arrangeClient()
    getContactInfo.mockResolvedValue({ name: 'Василиса' })
    getAvatar.mockResolvedValue({ available: true, url: 'https://pps.whatsapp.net/avatar.jpg' })
    receiveNotification.mockImplementation(() => new Promise(() => {}))

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    await waitFor(() => expect(screen.getByTestId('chat-avatar')).toHaveAttribute(
      'src',
      'https://pps.whatsapp.net/avatar.jpg',
    ))
    expect(getAvatar).toHaveBeenCalledWith(
      { instanceId: '123', apiToken: 'secret' },
      '79991234567@c.us',
      expect.any(AbortSignal),
    )
  })

  it('shows an initial fallback when the contact avatar is unavailable', async () => {
    arrangeClient()
    getContactInfo.mockResolvedValue({ name: 'Василиса' })
    getAvatar.mockResolvedValue({ available: false })
    receiveNotification.mockImplementation(() => new Promise(() => {}))

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    expect(await screen.findByTestId('chat-avatar')).toHaveTextContent('В')
  })

  it('uses the profile name when the contact is not saved in the phone book', async () => {
    arrangeClient()
    getContactInfo.mockResolvedValue({ name: 'Василиса' })
    receiveNotification.mockImplementation(() => new Promise(() => {}))

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    expect(await screen.findByRole('heading', { name: 'Василиса' })).toBeInTheDocument()
  })

  it('keeps the phone number and lets the user send a message when contact lookup fails', async () => {
    arrangeClient()
    getContactInfo.mockRejectedValue(new GreenApiError('retryable'))
    receiveNotification.mockImplementation(() => new Promise(() => {}))

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    expect(await screen.findByRole('heading', { name: '+79991234567' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: 'Привет' } })
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeEnabled()
  })

  it('shows the sending time, a spinner, and double checks after the message is read', async () => {
    arrangeClient()
    let resolveSend: ((result: { idMessage: string }) => void) | undefined
    let resolveDelivery: ((result: { receiptId: number; notification: object }) => void) | undefined
    sendMessage.mockImplementation(() => new Promise((resolve) => { resolveSend = resolve }))
    receiveNotification
      .mockImplementationOnce(() => new Promise((resolve) => { resolveDelivery = resolve }))
      .mockResolvedValueOnce({
        receiptId: 42,
        notification: {
          idMessage: 'queued-message',
          typeWebhook: 'outgoingMessageStatus',
          outgoingStatus: 'read',
        },
      })
      .mockImplementation(() => new Promise(() => {}))
    deleteNotification.mockResolvedValue({ deleted: true })

    render(<App apiUrl="https://api.green-api.com" />)

    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    expect(screen.getByRole('heading', { name: '+79991234567' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: 'Привет' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByLabelText('Отправляется')).toBeInTheDocument()
    resolveSend?.({ idMessage: 'queued-message' })

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith(
      { instanceId: '123', apiToken: 'secret' },
      '79991234567@c.us',
      'Привет',
    ))
    expect(screen.getByText('Привет')).toBeInTheDocument()
    expect(screen.getByLabelText('Время отправки')).toHaveTextContent(/^\d{2}:\d{2}$/)
    resolveDelivery?.({
      receiptId: 41,
      notification: {
        idMessage: 'queued-message',
        typeWebhook: 'outgoingMessageStatus',
        outgoingStatus: 'delivered',
      },
    })
    expect(await screen.findByLabelText('Доставлено')).toBeInTheDocument()
    expect(await screen.findByLabelText('Прочитано')).toBeInTheDocument()
    expect(screen.getByLabelText('Сообщение')).toHaveValue('')
  })

  it('keeps the failed message in the chat with a retry control', async () => {
    arrangeClient()
    sendMessage
      .mockRejectedValueOnce(new Error('secret https://api.green-api.com/token'))
      .mockResolvedValueOnce({ idMessage: 'retried-message' })

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))
    fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: 'Не теряй меня' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Не удалось отправить'))
    expect(screen.getByLabelText('Сообщение')).toHaveValue('Не теряй меня')
    expect(screen.getAllByText('Не теряй меня')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Повторить отправку' }))
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('Отправляется')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('secret')
    expect(document.body).not.toHaveTextContent('https://api.green-api.com/token')
  })

  it('shows retry when GREEN-API reports an unresolved recipient without a message id', async () => {
    arrangeClient()
    let resolveFailure: ((result: { receiptId: number; notification: object }) => void) | undefined
    sendMessage.mockResolvedValue({ idMessage: 'outgoing-1' })
    receiveNotification
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFailure = resolve }))
      .mockImplementation(() => new Promise(() => {}))
    deleteNotification.mockResolvedValue({ deleted: true })

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))
    fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: 'Проверь номер' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    resolveFailure?.({
      receiptId: 8,
      notification: { typeWebhook: 'outgoingMessageStatus', chatId: '79991234567', outgoingStatus: 'noAccount' },
    })

    expect(await screen.findByRole('button', { name: 'Повторить отправку' })).toBeInTheDocument()
  })

  it('renders a matching incoming text once and acknowledges its receipt', async () => {
    arrangeClient()
    receiveNotification
      .mockResolvedValueOnce({
        receiptId: 42,
        notification: {
          idMessage: 'incoming-1',
          typeWebhook: 'incomingMessageReceived',
          chatType: 'user',
          senderPhoneNumber: '+7 (999) 123-45-67',
          typeMessage: 'textMessage',
          text: '<img src=x onerror=alert(1)>',
        },
      })
      .mockImplementation(() => new Promise(() => {}))
    deleteNotification.mockResolvedValue({ deleted: true })

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    await waitFor(() => expect(deleteNotification).toHaveBeenCalledWith(
      { instanceId: '123', apiToken: 'secret' },
      42,
      expect.any(AbortSignal),
    ))
    expect(document.querySelector('img')).not.toBeInTheDocument()
  })

  it('does not render a repeated incoming message id twice', async () => {
    arrangeClient()
    const notification = {
      idMessage: 'incoming-1',
      typeWebhook: 'incomingMessageReceived',
      chatType: 'user',
      senderPhoneNumber: '79991234567',
      typeMessage: 'textMessage',
      text: 'Не дублируй меня',
    }
    receiveNotification
      .mockResolvedValueOnce({ receiptId: 41, notification })
      .mockResolvedValueOnce({ receiptId: 42, notification })
      .mockImplementation(() => new Promise(() => {}))
    deleteNotification.mockResolvedValue({ deleted: true })

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    await waitFor(() => expect(deleteNotification).toHaveBeenCalledTimes(2))
    expect(screen.getAllByText('Не дублируй меня')).toHaveLength(1)
  })

  it('returns to the connection form after a terminal polling error', async () => {
    arrangeClient()
    receiveNotification.mockRejectedValue(new GreenApiError('terminal'))

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    const terminalNotice = await screen.findByRole('alert')
    fireEvent.click(within(terminalNotice).getByRole('button', { name: 'Вернуться к подключению' }))
    expect(screen.getByLabelText('ID инстанса')).toHaveValue('')
    expect(screen.getByLabelText('API token инстанса')).toHaveValue('')
  })

  it('returns to the connection form from the chat header', async () => {
    arrangeClient()
    receiveNotification.mockImplementation(() => new Promise(() => {}))

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    const returnButton = await screen.findByRole('button', { name: 'Вернуться к подключению' })
    expect(returnButton.querySelector('svg')).toBeInTheDocument()
    expect(returnButton).toHaveAttribute('title', 'Вернуться к подключению')
    fireEvent.click(returnButton)
    expect(screen.getByLabelText('ID инстанса')).toHaveValue('')
    expect(screen.getByLabelText('API token инстанса')).toHaveValue('')
  })

  it('keeps an invalid phone on the form and blocks empty or oversized messages', () => {
    arrangeClient()
    render(<App apiUrl="https://api.green-api.com" />)

    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))
    expect(screen.getByRole('alert')).toHaveTextContent('международном формате')

    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: 'x'.repeat(4097) } })
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
