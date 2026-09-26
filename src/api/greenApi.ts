import type {
  GreenApiCredentials,
  IncomingNotification,
  OutgoingMessageStatus,
  ReceivedNotification,
} from '../domain/chat'

const receiveTimeoutSeconds = 5

type Fetch = typeof globalThis.fetch

type ClientOptions = {
  apiUrl: string
  fetch?: Fetch
}

export type GreenApiErrorKind = 'abort' | 'terminal' | 'retryable'

export class GreenApiError extends Error {
  readonly kind: GreenApiErrorKind
  readonly status?: number

  constructor(kind: GreenApiErrorKind, status?: number) {
    super(kind === 'abort' ? 'Запрос отменён.' : 'Не удалось выполнить запрос к GREEN-API.')
    this.name = 'GreenApiError'
    this.kind = kind
    this.status = status
  }
}

export type ReceiveResult = { kind: 'empty' } | ReceivedNotification

export type DeleteResult = { deleted: boolean }

export function createGreenApiClient({ apiUrl, fetch = globalThis.fetch }: ClientOptions) {
  function endpoint(
    credentials: GreenApiCredentials,
    method: 'sendMessage' | 'getContactInfo' | 'receiveNotification' | 'deleteNotification',
    receiptId?: number,
  ) {
    const path = [
      `waInstance${encodeURIComponent(credentials.instanceId)}`,
      method,
      encodeURIComponent(credentials.apiToken),
    ]

    if (receiptId !== undefined) {
      path.push(String(receiptId))
    }

    return `${apiUrl}/${path.join('/')}`
  }

  async function request(url: string, init: RequestInit): Promise<unknown> {
    let response: Response

    try {
      response = await fetch(url, init)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new GreenApiError('abort')
      }

      throw new GreenApiError('retryable')
    }

    if (!response.ok) {
      throw new GreenApiError(errorKindFromStatus(response.status), response.status)
    }

    const text = await response.text()

    if (text.trim() === '') {
      return undefined
    }

    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new GreenApiError('terminal', response.status)
    }
  }

  return {
    async getContactInfo(
      credentials: GreenApiCredentials,
      chatId: string,
      signal?: AbortSignal,
    ) {
      const body = await request(endpoint(credentials, 'getContactInfo'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chatId }),
        signal,
      })

      if (!isRecord(body)) {
        throw new GreenApiError('terminal')
      }

      return {
        contactName: stringField(body.contactName),
        name: stringField(body.name),
        chatId: stringField(body.chatId),
        chatType: stringField(body.chatType),
        phoneNumber: phoneField(body.phoneNumber),
        avatar: stringField(body.avatar),
      }
    },

    async sendMessage(
      credentials: GreenApiCredentials,
      chatId: string,
      message: string,
      signal?: AbortSignal,
    ) {
      const body = await request(endpoint(credentials, 'sendMessage'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chatId, message }),
        signal,
      })

      if (!isRecord(body) || typeof body.idMessage !== 'string') {
        throw new GreenApiError('terminal')
      }

      return { idMessage: body.idMessage }
    },

    async receiveNotification(credentials: GreenApiCredentials, signal?: AbortSignal): Promise<ReceiveResult> {
      const url = new URL(endpoint(credentials, 'receiveNotification'))
      url.searchParams.set('receiveTimeout', String(receiveTimeoutSeconds))
      const body = await request(url.toString(), { method: 'GET', signal })

      if (!isRecord(body)) {
        return { kind: 'empty' }
      }

      if (!isReceiptId(body.receiptId)) {
        throw new GreenApiError('terminal')
      }

      return {
        receiptId: body.receiptId,
        notification: normalizeNotification(body.body),
      }
    },

    async deleteNotification(
      credentials: GreenApiCredentials,
      receiptId: number,
      signal?: AbortSignal,
    ): Promise<DeleteResult> {
      const body = await request(endpoint(credentials, 'deleteNotification', receiptId), {
        method: 'DELETE',
        signal,
      })

      if (!isRecord(body) || typeof body.result !== 'boolean') {
        throw new GreenApiError('terminal')
      }

      return { deleted: body.result }
    },
  }
}

function errorKindFromStatus(status: number): GreenApiErrorKind {
  if (status === 429 || status >= 500) {
    return 'retryable'
  }

  return 'terminal'
}

function normalizeNotification(body: unknown): IncomingNotification | undefined {
  if (!isRecord(body)) {
    return undefined
  }

  const senderData = isRecord(body.senderData) ? body.senderData : undefined
  const messageData = isRecord(body.messageData) ? body.messageData : undefined
  const textMessageData = messageData && isRecord(messageData.textMessageData)
    ? messageData.textMessageData
    : undefined

  const fields: IncomingNotification = {
    idMessage: stringField(body.idMessage),
    typeWebhook: stringField(body.typeWebhook),
    chatId: senderData ? stringField(senderData.chatId) : stringField(body.chatId),
    outgoingStatus: outgoingStatusField(body.status),
    chatType: senderData ? stringField(senderData.chatType) : undefined,
    senderPhoneNumber: senderData ? phoneField(senderData.senderPhoneNumber) : undefined,
    typeMessage: messageData ? stringField(messageData.typeMessage) : undefined,
    text: textMessageData ? stringField(textMessageData.textMessage) : undefined,
  }

  const notification = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as IncomingNotification

  return Object.keys(notification).length > 0 ? notification : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isReceiptId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function phoneField(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}

function outgoingStatusField(value: unknown): OutgoingMessageStatus | undefined {
  return value === 'delivered' || value === 'read' || value === 'failed' || value === 'noAccount'
    ? value
    : undefined
}
