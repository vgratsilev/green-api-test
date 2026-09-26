import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GreenApiError } from '../../api/greenApi'
import type { IncomingNotification } from '../../domain/chat'
import { useNotificationPolling } from './useNotificationPolling'

const credentials = { instanceId: '123', apiToken: 'secret' }

function incoming(overrides: Partial<IncomingNotification> = {}): IncomingNotification {
  return {
    idMessage: 'incoming-1',
    typeWebhook: 'incomingMessageReceived',
    chatType: 'user',
    senderPhoneNumber: '+7 (999) 123-45-67',
    typeMessage: 'textMessage',
    text: 'Привет',
    ...overrides,
  }
}

describe('useNotificationPolling', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('classifies, acknowledges, and only then starts the next receive', async () => {
    const receiveNotification = vi.fn()
      .mockResolvedValueOnce({ receiptId: 42, notification: incoming() })
      .mockImplementation(() => new Promise(() => {}))
    const deleteNotification = vi.fn().mockResolvedValue({ deleted: true })
    const onIncoming = vi.fn()
    const onOutgoingStatus = vi.fn()

    renderHook(() => useNotificationPolling({
      client: { receiveNotification, deleteNotification },
      credentials,
      phone: '79991234567',
      onIncoming,
      onOutgoingStatus,
    }))

    await waitFor(() => expect(onIncoming).toHaveBeenCalledWith(incoming()))
    await waitFor(() => expect(deleteNotification).toHaveBeenCalledWith(credentials, 42, expect.any(AbortSignal)))
    await waitFor(() => expect(receiveNotification).toHaveBeenCalledTimes(2))
    expect(deleteNotification.mock.invocationCallOrder[0]).toBeLessThan(receiveNotification.mock.invocationCallOrder[1])
  })

  it('acknowledges unrelated or malformed records without rendering them', async () => {
    const receiveNotification = vi.fn()
      .mockResolvedValueOnce({ receiptId: 7, notification: incoming({ senderPhoneNumber: '79990000000' }) })
      .mockResolvedValueOnce({ receiptId: 8, notification: undefined })
      .mockImplementation(() => new Promise(() => {}))
    const deleteNotification = vi.fn().mockResolvedValue({ deleted: true })
    const onIncoming = vi.fn()
    const onOutgoingStatus = vi.fn()

    renderHook(() => useNotificationPolling({
      client: { receiveNotification, deleteNotification },
      credentials,
      phone: '79991234567',
      onIncoming,
      onOutgoingStatus,
    }))

    await waitFor(() => expect(deleteNotification).toHaveBeenCalledTimes(2))
    expect(onIncoming).not.toHaveBeenCalled()
  })

  it('accepts a hidden-number reply only from the contact lookup chatId', async () => {
    const receiveNotification = vi.fn()
      .mockResolvedValueOnce({ receiptId: 7, notification: incoming({ idMessage: 'other', senderPhoneNumber: '0', chatId: 'other-chat' }) })
      .mockResolvedValueOnce({ receiptId: 8, notification: incoming({ idMessage: 'matching', senderPhoneNumber: '0', chatId: '10000000' }) })
      .mockImplementation(() => new Promise(() => {}))
    const deleteNotification = vi.fn().mockResolvedValue({ deleted: true })
    const onIncoming = vi.fn()

    renderHook(() => useNotificationPolling({
      client: { receiveNotification, deleteNotification },
      credentials,
      phone: '79991234567',
      contactChatId: '10000000',
      onIncoming,
      onOutgoingStatus: vi.fn(),
    }))

    await waitFor(() => expect(deleteNotification).toHaveBeenCalledTimes(2))
    expect(onIncoming).toHaveBeenCalledTimes(1)
    expect(onIncoming).toHaveBeenCalledWith(incoming({ idMessage: 'matching', senderPhoneNumber: '0', chatId: '10000000' }))
  })

  it('forwards an outgoing delivery status and acknowledges its receipt', async () => {
    const receiveNotification = vi.fn()
      .mockResolvedValueOnce({
        receiptId: 9,
        notification: { idMessage: 'outgoing-1', typeWebhook: 'outgoingMessageStatus', outgoingStatus: 'delivered' },
      })
      .mockImplementation(() => new Promise(() => {}))
    const deleteNotification = vi.fn().mockResolvedValue({ deleted: true })
    const onOutgoingStatus = vi.fn()

    renderHook(() => useNotificationPolling({
      client: { receiveNotification, deleteNotification },
      credentials,
      phone: '79991234567',
      onIncoming: vi.fn(),
      onOutgoingStatus,
    }))

    await waitFor(() => expect(onOutgoingStatus).toHaveBeenCalledWith({ idMessage: 'outgoing-1', status: 'delivered' }))
    await waitFor(() => expect(deleteNotification).toHaveBeenCalledWith(credentials, 9, expect.any(AbortSignal)))
  })

  it('retries a receive at 1, 2, and 4 seconds before stopping', async () => {
    vi.useFakeTimers()
    const receiveNotification = vi.fn().mockRejectedValue(new GreenApiError('retryable'))
    const deleteNotification = vi.fn()
    const { result } = renderHook(() => useNotificationPolling({
      client: { receiveNotification, deleteNotification },
      credentials,
      phone: '79991234567',
      onIncoming: vi.fn(),
      onOutgoingStatus: vi.fn(),
    }))

    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(receiveNotification).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000) })
    await act(async () => {})

    expect(receiveNotification).toHaveBeenCalledTimes(4)
    expect(result.current.status).toBe('retry-exhausted')
    expect(deleteNotification).not.toHaveBeenCalled()
  })

  it('keeps a failed delete receipt for manual recovery', async () => {
    vi.useFakeTimers()
    const receiveNotification = vi.fn()
      .mockResolvedValueOnce({ receiptId: 42, notification: incoming() })
      .mockImplementation(() => new Promise(() => {}))
    const deleteNotification = vi.fn()
      .mockRejectedValueOnce(new GreenApiError('retryable'))
      .mockRejectedValueOnce(new GreenApiError('retryable'))
      .mockRejectedValueOnce(new GreenApiError('retryable'))
      .mockRejectedValueOnce(new GreenApiError('retryable'))
      .mockResolvedValueOnce({ deleted: true })
    const { result } = renderHook(() => useNotificationPolling({
      client: { receiveNotification, deleteNotification },
      credentials,
      phone: '79991234567',
      onIncoming: vi.fn(),
      onOutgoingStatus: vi.fn(),
    }))

    await act(async () => { await vi.runAllTimersAsync() })
    expect(result.current.status).toBe('retry-exhausted')
    expect(receiveNotification).toHaveBeenCalledTimes(1)
    expect(deleteNotification).toHaveBeenCalledTimes(4)

    act(() => result.current.retry())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(deleteNotification).toHaveBeenCalledTimes(5)
    expect(deleteNotification).toHaveBeenLastCalledWith(credentials, 42, expect.any(AbortSignal))
  })

  it('stops terminal failures without retrying or acknowledging', async () => {
    vi.useFakeTimers()
    const receiveNotification = vi.fn().mockRejectedValue(new GreenApiError('terminal'))
    const deleteNotification = vi.fn()
    const { result } = renderHook(() => useNotificationPolling({
      client: { receiveNotification, deleteNotification },
      credentials,
      phone: '79991234567',
      onIncoming: vi.fn(),
      onOutgoingStatus: vi.fn(),
    }))

    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.status).toBe('terminal')
    expect(receiveNotification).toHaveBeenCalledTimes(1)
    expect(deleteNotification).not.toHaveBeenCalled()
  })
})
