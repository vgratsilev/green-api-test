import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import { createGreenApiClient, GreenApiError } from './api/greenApi'

vi.mock('./api/greenApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/greenApi')>()
  return { ...actual, createGreenApiClient: vi.fn() }
})

const sendMessage = vi.fn()
const getStateInstance = vi.fn()
const getContactInfo = vi.fn()
const receiveNotification = vi.fn()
const deleteNotification = vi.fn()

function arrangeClient() {
  getStateInstance.mockResolvedValue({ authorized: true })
  getContactInfo.mockResolvedValue({})
  vi.mocked(createGreenApiClient).mockReturnValue({
    getStateInstance,
    sendMessage,
    getContactInfo,
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
    expect(screen.getByText('Подключите GREEN-API, чтобы начать переписку в Telegram.')).toBeInTheDocument()
    expect(screen.getByLabelText('ID инстанса')).toHaveValue('')
    expect(screen.getByLabelText('API token инстанса')).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Страна' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('uses the documented host when no build-time configuration is available', () => {
    vi.stubEnv('VITE_GREEN_API_URL', undefined)

    render(<App />)

    expect(screen.getByLabelText('API origin GREEN-API')).toHaveValue('https://api.green-api.com')
    expect(screen.getByLabelText('ID инстанса')).toBeInTheDocument()
  })

  it('opens the chat only after an authorized preflight without exposing connection secrets', async () => {
    arrangeClient()
    receiveNotification.mockImplementation(() => new Promise(() => {}))

    render(<App apiUrl="https://4100.api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret-token' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    await waitFor(() => expect(getStateInstance).toHaveBeenCalledWith(
      { instanceId: '123', apiToken: 'secret-token' },
      expect.any(AbortSignal),
    ))
    expect(await screen.findByRole('heading', { name: '+79991234567' })).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('secret-token')
  })

  it('keeps the form visible when preflight rejects the instance state', async () => {
    arrangeClient()
    getStateInstance.mockResolvedValue({ authorized: false })

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret-token' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось подтвердить подключение')
    expect(getContactInfo).not.toHaveBeenCalled()
    expect(receiveNotification).not.toHaveBeenCalled()
    expect(document.body).not.toHaveTextContent('secret-token')
  })

  it('aborts an unfinished preflight when App unmounts', async () => {
    arrangeClient()
    let signal: AbortSignal | undefined
    getStateInstance.mockImplementation((_credentials, nextSignal) => {
      signal = nextSignal
      return new Promise(() => {})
    })

    const view = render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))
    await waitFor(() => expect(signal).toBeDefined())

    view.unmount()

    expect(signal?.aborted).toBe(true)
  })

  it('keeps the confirmed client and chat effects stable across an unrelated App rerender', async () => {
    arrangeClient()
    receiveNotification.mockImplementation(() => new Promise(() => {}))
    const view = render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))
    await screen.findByRole('heading', { name: '+79991234567' })
    await waitFor(() => expect(receiveNotification).toHaveBeenCalledTimes(1))

    view.rerender(<App apiUrl="https://api.green-api.com" />)

    expect(createGreenApiClient).toHaveBeenCalledTimes(1)
    expect(getContactInfo).toHaveBeenCalledTimes(1)
    expect(receiveNotification).toHaveBeenCalledTimes(1)
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
    getContactInfo.mockResolvedValue({ name: 'Василиса', avatar: 'https://4100.api.green-api.com/download/avatar.jpg' })
    receiveNotification.mockImplementation(() => new Promise(() => {}))

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    await waitFor(() => expect(screen.getByTestId('chat-avatar')).toHaveAttribute(
      'src',
      'https://4100.api.green-api.com/download/avatar.jpg',
    ))
    expect(getContactInfo).toHaveBeenCalledTimes(1)
  })

  it('shows an initial fallback when the contact avatar is unavailable', async () => {
    arrangeClient()
    getContactInfo.mockResolvedValue({ name: 'Василиса', avatar: '' })
    receiveNotification.mockImplementation(() => new Promise(() => {}))

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    await waitFor(() => expect(screen.getByTestId('chat-avatar')).toHaveTextContent('В'))
  })

  it('rejects a non-HTTPS contact avatar URL', async () => {
    arrangeClient()
    getContactInfo.mockResolvedValue({ name: 'Василиса', avatar: 'javascript:alert(1)' })
    receiveNotification.mockImplementation(() => new Promise(() => {}))

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    expect(await screen.findByRole('heading', { name: 'Василиса' })).toBeInTheDocument()
    expect(screen.getByTestId('chat-avatar')).not.toHaveAttribute('src')
  })

  it('shows a hidden-number reply only when its chatId matches the looked-up contact', async () => {
    arrangeClient()
    getContactInfo.mockResolvedValue({ name: 'Василиса', chatId: '10000000', chatType: 'user', phoneNumber: '79991234567' })
    let resolveReceive: ((result: { receiptId: number; notification: object }) => void) | undefined
    receiveNotification
      .mockImplementationOnce(() => new Promise((resolve) => { resolveReceive = resolve }))
      .mockResolvedValueOnce({ receiptId: 52, notification: {
        idMessage: 'matching', typeWebhook: 'incomingMessageReceived', chatId: '10000000',
        chatType: 'user', senderPhoneNumber: '0', typeMessage: 'textMessage', text: 'Ответ собеседника',
      } })
      .mockImplementation(() => new Promise(() => {}))
    deleteNotification.mockResolvedValue({ deleted: true })

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))
    expect(await screen.findByRole('heading', { name: 'Василиса' })).toBeInTheDocument()

    const hiddenReply = (chatId: string, idMessage: string, text: string) => ({
      idMessage,
      typeWebhook: 'incomingMessageReceived',
      chatId,
      chatType: 'user',
      senderPhoneNumber: '0',
      typeMessage: 'textMessage',
      text,
    })
    resolveReceive?.({ receiptId: 51, notification: hiddenReply('other-chat', 'other', 'Чужой ответ') })

    await waitFor(() => expect(deleteNotification).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Чужой ответ')).not.toBeInTheDocument()
    expect(screen.getByText('Ответ собеседника')).toBeInTheDocument()
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
    receiveNotification
      .mockResolvedValueOnce({ receiptId: 60, notification: {
        idMessage: 'incoming-after-lookup-error', typeWebhook: 'incomingMessageReceived',
        chatId: '10000000', chatType: 'user', senderPhoneNumber: '79991234567',
        typeMessage: 'textMessage', text: 'Ответ без lookup',
      } })
      .mockImplementation(() => new Promise(() => {}))
    deleteNotification.mockResolvedValue({ deleted: true })

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    expect(await screen.findByRole('heading', { name: '+79991234567' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: 'Привет' } })
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeEnabled()
    expect(await screen.findByText('Ответ без lookup')).toBeInTheDocument()
    expect(screen.getByLabelText('Время получения')).toHaveTextContent(/^\d{2}:\d{2}$/)
  })

  it('shows sending, then queued without a status notification, then delivery and read', async () => {
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

    expect(await screen.findByRole('heading', { name: '+79991234567' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: 'Привет' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByLabelText('Отправляется')).toBeInTheDocument()
    resolveSend?.({ idMessage: 'queued-message' })

    expect(await screen.findByText('В очереди')).toBeInTheDocument()
    expect(screen.queryByLabelText('Отправляется')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Сообщение')).toHaveValue('')

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

  it('keeps a request failure only in the composer until manual resubmission', async () => {
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
    await screen.findByLabelText('Сообщение')
    fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: 'Не теряй меня' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Не удалось отправить'))
    expect(screen.getByLabelText('Сообщение')).toHaveValue('Не теряй меня')
    expect(screen.getByLabelText('Сообщение')).toHaveAttribute('aria-describedby', 'message-hint send-error')
    expect(within(screen.getByLabelText('Сообщения')).queryByText('Не теряй меня')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Повторить отправку' })).not.toBeInTheDocument()
    expect(sendMessage).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('В очереди')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('secret')
    expect(document.body).not.toHaveTextContent('https://api.green-api.com/token')
  })

  it('does not attach a status without an id to a queued message', async () => {
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
    await screen.findByLabelText('Сообщение')
    fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: 'Проверь номер' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    resolveFailure?.({
      receiptId: 8,
      notification: { typeWebhook: 'outgoingMessageStatus', chatId: '79991234567', outgoingStatus: 'noAccount' },
    })

    await waitFor(() => expect(deleteNotification).toHaveBeenCalledTimes(1))
    expect(screen.getByText('В очереди')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Повторить отправку' })).not.toBeInTheDocument()
  })

  it('ignores an unknown message id and a late status from a failed attempt during retry', async () => {
    arrangeClient()
    const receiveResolvers: Array<(result: { receiptId: number; notification: object }) => void> = []
    let resolveRetry: ((result: { idMessage: string }) => void) | undefined
    sendMessage
      .mockResolvedValueOnce({ idMessage: 'first-attempt' })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRetry = resolve }))
    receiveNotification.mockImplementation(() => new Promise((resolve) => { receiveResolvers.push(resolve) }))
    deleteNotification.mockResolvedValue({ deleted: true })

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))
    await screen.findByLabelText('Сообщение')
    fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: 'Повтори меня' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(await screen.findByText('В очереди')).toBeInTheDocument()

    const statusNotification = (idMessage: string, outgoingStatus: string) => ({
      typeWebhook: 'outgoingMessageStatus', chatId: '79991234567', idMessage, outgoingStatus,
    })
    await waitFor(() => expect(receiveResolvers).toHaveLength(1))
    receiveResolvers[0]({ receiptId: 1, notification: statusNotification('unknown', 'failed') })
    await waitFor(() => expect(receiveResolvers).toHaveLength(2))
    expect(screen.getByText('В очереди')).toBeInTheDocument()

    receiveResolvers[1]({ receiptId: 2, notification: statusNotification('first-attempt', 'failed') })
    const retry = await screen.findByRole('button', { name: 'Повторить отправку' })
    fireEvent.click(retry)
    expect(await screen.findByLabelText('Отправляется')).toBeInTheDocument()
    await waitFor(() => expect(receiveResolvers).toHaveLength(3))
    receiveResolvers[2]({ receiptId: 3, notification: statusNotification('first-attempt', 'failed') })
    await waitFor(() => expect(deleteNotification).toHaveBeenCalledTimes(3))
    expect(screen.getByLabelText('Отправляется')).toBeInTheDocument()
    resolveRetry?.({ idMessage: 'second-attempt' })
    expect(await screen.findByText('В очереди')).toBeInTheDocument()
    expect(sendMessage).toHaveBeenCalledTimes(2)
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

  it('follows new messages only while the reader is near the bottom', async () => {
    arrangeClient()
    const receiveResolvers: Array<(result: { receiptId: number; notification: object }) => void> = []
    receiveNotification.mockImplementation(() => new Promise((resolve) => { receiveResolvers.push(resolve) }))
    deleteNotification.mockResolvedValue({ deleted: true })

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    const list = await screen.findByLabelText('Сообщения')
    Object.defineProperties(list, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1000 },
    })
    const deliver = async (index: number) => {
      await waitFor(() => expect(receiveResolvers).toHaveLength(index + 1))
      await act(async () => {
        receiveResolvers[index]({ receiptId: index + 1, notification: {
          idMessage: `incoming-${index}`,
          typeWebhook: 'incomingMessageReceived',
          chatType: 'user',
          senderPhoneNumber: '79991234567',
          typeMessage: 'textMessage',
          text: `Сообщение ${index}`,
        } })
      })
      expect(await screen.findByText(`Сообщение ${index}`)).toBeInTheDocument()
    }

    await deliver(0)
    expect(list.scrollTop).toBe(900)

    list.scrollTop = 300
    fireEvent.scroll(list)
    await deliver(1)
    expect(list.scrollTop).toBe(300)

    list.scrollTop = 850
    fireEvent.scroll(list)
    await deliver(2)
    expect(list.scrollTop).toBe(900)
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
    expect(screen.getByLabelText('ID инстанса')).toHaveValue('123')
    expect(screen.getByLabelText('API token инстанса')).toHaveValue('secret')
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
    expect(screen.getByLabelText('ID инстанса')).toHaveValue('123')
    expect(screen.getByLabelText('API token инстанса')).toHaveValue('secret')
  })

  it('restores a chat snapshot and connection values after returning to the same recipient', async () => {
    arrangeClient()
    receiveNotification
      .mockResolvedValueOnce({ receiptId: 73, notification: {
        idMessage: 'saved-message', typeWebhook: 'incomingMessageReceived', chatType: 'user',
        senderPhoneNumber: '79991234567', typeMessage: 'textMessage', text: 'Сохранённый ответ',
      } })
      .mockImplementation(() => new Promise(() => {}))
    deleteNotification.mockResolvedValue({ deleted: true })

    render(<App apiUrl="https://4100.api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    expect(await screen.findByText('Сохранённый ответ')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Вернуться к подключению' }))
    expect(screen.getByLabelText('API origin GREEN-API')).toHaveValue('https://4100.api.green-api.com')
    expect(screen.getByLabelText('ID инстанса')).toHaveValue('123')
    expect(screen.getByLabelText('API token инстанса')).toHaveValue('secret')
    expect(screen.getByLabelText('Номер получателя')).toHaveValue('+7 999 123 45 67')

    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))
    expect(await screen.findByText('Сохранённый ответ')).toBeInTheDocument()
  })

  it('does not acknowledge a late notification after leaving the chat', async () => {
    arrangeClient()
    let resolveReceive: ((value: { receiptId: number; notification: object }) => void) | undefined
    receiveNotification.mockImplementation(() => new Promise((resolve) => { resolveReceive = resolve }))

    render(<App apiUrl="https://api.green-api.com" />)
    fireEvent.change(screen.getByLabelText('ID инстанса'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('API token инстанса'), { target: { value: 'secret' } })
    chooseCountry('RU')
    fireEvent.change(screen.getByLabelText('Номер получателя'), { target: { value: '+79991234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть чат' }))

    await waitFor(() => expect(receiveNotification).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Вернуться к подключению' }))
    await act(async () => {
      resolveReceive?.({ receiptId: 42, notification: {
        idMessage: 'late-incoming', typeWebhook: 'incomingMessageReceived', chatType: 'user',
        senderPhoneNumber: '79991234567', typeMessage: 'textMessage', text: 'Поздний ответ',
      } })
    })

    expect(deleteNotification).not.toHaveBeenCalled()
    expect(screen.queryByText('Поздний ответ')).not.toBeInTheDocument()
  })

  it('keeps an invalid phone on the form and blocks empty or oversized messages', async () => {
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
    await screen.findByLabelText('Сообщение')
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: 'x'.repeat(4097) } })
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
