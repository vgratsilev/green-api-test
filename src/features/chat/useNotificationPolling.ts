import { useCallback, useEffect, useRef, useState } from 'react'

import { GreenApiError } from '../../api/greenApi'
import type { GreenApiCredentials, IncomingNotification, OutgoingMessageStatus } from '../../domain/chat'

type PollingClient = {
  receiveNotification: (credentials: GreenApiCredentials, signal?: AbortSignal) => Promise<
    { kind: 'empty' } | { receiptId: number; notification?: IncomingNotification }
  >
  deleteNotification: (
    credentials: GreenApiCredentials,
    receiptId: number,
    signal?: AbortSignal,
  ) => Promise<{ deleted: boolean }>
}

export type PollingStatus = 'polling' | 'retry-exhausted' | 'terminal'

type UseNotificationPollingOptions = {
  client: PollingClient
  credentials: GreenApiCredentials
  phone: string
  onIncoming: (notification: IncomingNotification) => void
  onOutgoingStatus: (notification: OutgoingStatusNotification) => void
}

type OutgoingStatusNotification = {
  idMessage?: string
  status: OutgoingMessageStatus
}

const retryDelays = [1_000, 2_000, 4_000]

export function useNotificationPolling({
  client,
  credentials,
  phone,
  onIncoming,
  onOutgoingStatus,
}: UseNotificationPollingOptions) {
  const [status, setStatus] = useState<PollingStatus>('polling')
  const [run, setRun] = useState(0)
  const pendingReceiptRef = useRef<number | undefined>(undefined)
  const onIncomingRef = useRef(onIncoming)
  const onOutgoingStatusRef = useRef(onOutgoingStatus)
  onIncomingRef.current = onIncoming
  onOutgoingStatusRef.current = onOutgoingStatus

  const retry = useCallback(() => {
    setStatus('polling')
    setRun((current) => current + 1)
  }, [])

  useEffect(() => {
    let active = true
    let retryCount = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined

    const schedule = (callback: () => void, delay: number) => {
      timer = setTimeout(callback, delay)
    }

    const stopWith = (nextStatus: PollingStatus) => {
      if (active) setStatus(nextStatus)
    }

    const consume = async () => {
      if (!active) return

      controller = new AbortController()
      try {
        if (pendingReceiptRef.current !== undefined) {
          const deleted = await client.deleteNotification(credentials, pendingReceiptRef.current, controller.signal)
          if (!deleted.deleted) {
            throw new GreenApiError('terminal')
          }
          pendingReceiptRef.current = undefined
        } else {
          const received = await client.receiveNotification(credentials, controller.signal)
          if ('kind' in received) {
            retryCount = 0
            schedule(() => void consume(), 0)
            return
          }

          if (isMatchingIncomingText(received.notification, phone)) {
            onIncomingRef.current(received.notification)
          }
          if (isMatchingOutgoingStatus(received.notification, phone)) {
            onOutgoingStatusRef.current({
              idMessage: received.notification.idMessage,
              status: received.notification.outgoingStatus,
            })
          }
          pendingReceiptRef.current = received.receiptId
        }

        retryCount = 0
        schedule(() => void consume(), 0)
      } catch (error) {
        if (!active || isAbort(error)) return

        if (isRetryable(error) && retryCount < retryDelays.length) {
          const delay = retryDelays[retryCount]
          retryCount += 1
          schedule(() => void consume(), delay)
          return
        }

        stopWith(isRetryable(error) ? 'retry-exhausted' : 'terminal')
      }
    }

    schedule(() => void consume(), 0)

    return () => {
      active = false
      if (timer !== undefined) clearTimeout(timer)
      controller?.abort()
    }
  }, [client, credentials, phone, run])

  return { status, retry }
}

function isMatchingIncomingText(
  notification: IncomingNotification | undefined,
  activePhone: string,
): notification is IncomingNotification & { idMessage: string; text: string } {
  return notification?.chatType === 'user'
    && notification.typeWebhook === 'incomingMessageReceived'
    && notification.typeMessage === 'textMessage'
    && typeof notification.idMessage === 'string'
    && typeof notification.text === 'string'
    && normalizePhone(notification.senderPhoneNumber) === normalizePhone(activePhone)
}

function isMatchingOutgoingStatus(
  notification: IncomingNotification | undefined,
  activePhone: string,
): notification is IncomingNotification & { outgoingStatus: OutgoingMessageStatus } {
  if (notification?.typeWebhook !== 'outgoingMessageStatus' || notification.outgoingStatus === undefined) return false
  if (typeof notification.idMessage === 'string') return true

  return (notification.outgoingStatus === 'failed' || notification.outgoingStatus === 'noAccount')
    && normalizePhone(notification.chatId) === normalizePhone(activePhone)
}

function normalizePhone(phone: string | undefined): string | undefined {
  const normalized = phone?.replace(/\D/g, '')
  return normalized || undefined
}

function isAbort(error: unknown): boolean {
  return error instanceof GreenApiError && error.kind === 'abort'
}

function isRetryable(error: unknown): boolean {
  return error instanceof GreenApiError && error.kind === 'retryable'
}
