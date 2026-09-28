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
  contactStatus?: 'loading' | 'resolved' | 'unavailable'
  contactChatId?: string
  onIncoming: (notification: IncomingNotification) => void
  onOutgoingStatus: (notification: OutgoingStatusNotification) => void
}

type OutgoingStatusNotification = {
  idMessage?: string
  status: OutgoingMessageStatus
}

const retryDelays = [1_000, 2_000, 4_000]

type InFlightOperation =
  | { kind: 'receive'; settled: Promise<void> }
  | { kind: 'delete'; receiptId: number; settled: Promise<boolean | undefined> }

type PendingReceipt = { receiptId: number; notification?: IncomingNotification; classified: boolean }
type NotificationClassification =
  | { kind: 'incoming'; notification: IncomingNotification & { idMessage: string; text: string } }
  | { kind: 'outgoing'; notification: IncomingNotification & { outgoingStatus: OutgoingMessageStatus } }
  | { kind: 'ignore' | 'defer' }

export function useNotificationPolling({
  client,
  credentials,
  phone,
  contactStatus = 'resolved',
  contactChatId,
  onIncoming,
  onOutgoingStatus,
}: UseNotificationPollingOptions) {
  const [status, setStatus] = useState<PollingStatus>('polling')
  const [run, setRun] = useState(0)
  const pendingReceiptRef = useRef<PendingReceipt | undefined>(undefined)
  const inFlightRef = useRef<InFlightOperation | undefined>(undefined)
  const onIncomingRef = useRef(onIncoming)
  const onOutgoingStatusRef = useRef(onOutgoingStatus)
  onIncomingRef.current = onIncoming
  onOutgoingStatusRef.current = onOutgoingStatus
  const contactRef = useRef({ status: contactStatus, chatId: contactChatId })
  contactRef.current = { status: contactStatus, chatId: contactChatId }
  const retry = useCallback(() => {
    setStatus('polling')
    setRun((current) => current + 1)
  }, [])

  useEffect(() => {
    if (pendingReceiptRef.current) setRun((current) => current + 1)
  }, [contactChatId, contactStatus])

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

      const previousOperation = inFlightRef.current
      if (previousOperation) {
        const deleted = await previousOperation.settled
        if (!active) return
        if (previousOperation.kind === 'delete' && deleted !== undefined
          && pendingReceiptRef.current?.receiptId === previousOperation.receiptId) {
          pendingReceiptRef.current = undefined
        }
      }
      if (!active) return

      controller = new AbortController()
      try {
        if (pendingReceiptRef.current) {
          const pendingReceipt = pendingReceiptRef.current
          if (!pendingReceipt.classified) {
            const classification = classifyNotification(
              pendingReceipt.notification,
              phone,
              contactRef.current.status,
              contactRef.current.chatId,
            )
            if (classification.kind === 'defer') return
            if (classification.kind === 'incoming') onIncomingRef.current(classification.notification)
            if (classification.kind === 'outgoing') {
              onOutgoingStatusRef.current({
                idMessage: classification.notification.idMessage,
                status: classification.notification.outgoingStatus,
              })
            }
            pendingReceipt.classified = true
          }

          const receiptId = pendingReceipt.receiptId
          const request = client.deleteNotification(credentials, receiptId, controller.signal)
          inFlightRef.current = { kind: 'delete', receiptId, settled: request.then((result) => result.deleted, () => undefined) }
          await request
          if (!active) return
          pendingReceiptRef.current = undefined
        } else {
          const request = client.receiveNotification(credentials, controller.signal)
          inFlightRef.current = { kind: 'receive', settled: request.then(() => {}, () => {}) }
          const received = await request
          if (!active) return
          if ('kind' in received) {
            retryCount = 0
            schedule(() => void consume(), 0)
            return
          }

          pendingReceiptRef.current = { receiptId: received.receiptId, notification: received.notification, classified: false }
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

function classifyNotification(
  notification: IncomingNotification | undefined,
  activePhone: string,
  contactStatus: 'loading' | 'resolved' | 'unavailable',
  contactChatId: string | undefined,
): NotificationClassification {
  if (isMatchingOutgoingStatus(notification, activePhone)) return { kind: 'outgoing', notification }
  if (!isDisplayableIncoming(notification)) return { kind: 'ignore' }

  const isHiddenNumber = notification.senderPhoneNumber === '0'
  if (isHiddenNumber && !notification.chatId) return { kind: 'ignore' }
  if (isHiddenNumber && (contactStatus !== 'resolved' || !contactChatId)) return { kind: 'defer' }

  if (isHiddenNumber) {
    if (notification.chatId !== contactChatId) return { kind: 'ignore' }
  } else {
    if (normalizePhone(notification.senderPhoneNumber) !== normalizePhone(activePhone)) return { kind: 'ignore' }
    if (contactChatId !== undefined && notification.chatId !== undefined && notification.chatId !== contactChatId) {
      return { kind: 'ignore' }
    }
  }

  return { kind: 'incoming', notification }
}

function isDisplayableIncoming(
  notification: IncomingNotification | undefined,
): notification is IncomingNotification & { idMessage: string; text: string } {
  return notification?.typeWebhook === 'incomingMessageReceived'
    && notification.chatType === 'user'
    && notification.typeMessage === 'textMessage'
    && typeof notification.idMessage === 'string'
    && typeof notification.text === 'string'
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
