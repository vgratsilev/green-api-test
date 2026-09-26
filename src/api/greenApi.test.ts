import { describe, expect, it, vi } from 'vitest'

import { createGreenApiClient, type GreenApiError } from './greenApi'

const credentials = {
  instanceId: '4100/000',
  apiToken: 'sentinel-token/with-space',
}

const apiUrl = 'https://api.green-api.example'
const secretUrl = `${apiUrl}/waInstance${encodeURIComponent(credentials.instanceId)}/sendMessage/${encodeURIComponent(credentials.apiToken)}`
const contactInfoUrl = `${apiUrl}/waInstance${encodeURIComponent(credentials.instanceId)}/getContactInfo/${encodeURIComponent(credentials.apiToken)}`

function response(body: unknown, init?: ResponseInit) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function expectSafeError(error: GreenApiError) {
  expect(error).not.toMatchObject({ message: expect.stringContaining(credentials.apiToken) })
  expect(JSON.stringify(error)).not.toContain(credentials.apiToken)
  expect(JSON.stringify(error)).not.toContain(secretUrl)
}

describe('GREEN-API client', () => {
  it('sends a JSON message and returns its queued id', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ idMessage: 'message-1' }))
    const client = createGreenApiClient({ apiUrl, fetch })

    await expect(client.sendMessage(credentials, '79998887766@c.us', 'Привет')).resolves.toEqual({
      idMessage: 'message-1',
    })
    expect(fetch).toHaveBeenCalledWith(secretUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chatId: '79998887766@c.us', message: 'Привет' }),
      signal: undefined,
    })
  })

  it('gets available contact and profile names for a direct chat', async () => {
    const fetch = vi.fn().mockResolvedValue(response({
      contactName: 'Василиса Премудрая',
      name: 'Василиса',
      chatId: '10000000',
      chatType: 'user',
      phoneNumber: 79998887766,
      avatar: 'https://4100.api.green-api.com/download/avatar.jpg',
    }))
    const client = createGreenApiClient({ apiUrl, fetch })

    await expect(client.getContactInfo(credentials, '79998887766@c.us')).resolves.toEqual({
      contactName: 'Василиса Премудрая',
      name: 'Василиса',
      chatId: '10000000',
      chatType: 'user',
      phoneNumber: '79998887766',
      avatar: 'https://4100.api.green-api.com/download/avatar.jpg',
    })
    expect(fetch).toHaveBeenCalledWith(contactInfoUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chatId: '79998887766@c.us' }),
      signal: undefined,
    })
  })

  it('reads one notification with the fixed five-second timeout and normalizes supported fields', async () => {
    const fetch = vi.fn().mockResolvedValue(
      response({
        receiptId: 42,
        body: {
          typeWebhook: 'incomingMessageReceived',
          idMessage: 'incoming-1',
          senderData: { chatId: '10000000', chatType: 'user', senderPhoneNumber: 79998887766 },
          messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Здравствуйте' } },
          ignored: 'field',
        },
      }),
    )
    const client = createGreenApiClient({ apiUrl, fetch })

    await expect(client.receiveNotification(credentials)).resolves.toEqual({
      receiptId: 42,
      notification: {
        idMessage: 'incoming-1',
        chatType: 'user',
        chatId: '10000000',
        senderPhoneNumber: '79998887766',
        typeWebhook: 'incomingMessageReceived',
        typeMessage: 'textMessage',
        text: 'Здравствуйте',
      },
    })
    expect(fetch).toHaveBeenCalledWith(
      `${apiUrl}/waInstance${encodeURIComponent(credentials.instanceId)}/receiveNotification/${encodeURIComponent(credentials.apiToken)}?receiveTimeout=5`,
      { method: 'GET', signal: undefined },
    )
  })

  it('normalizes an outgoing message status with its message id', async () => {
    const fetch = vi.fn().mockResolvedValue(response({
      receiptId: 42,
      body: {
        typeWebhook: 'outgoingMessageStatus',
        idMessage: 'outgoing-1',
        status: 'read',
      },
    }))
    const client = createGreenApiClient({ apiUrl, fetch })

    await expect(client.receiveNotification(credentials)).resolves.toEqual({
      receiptId: 42,
      notification: {
        idMessage: 'outgoing-1',
        typeWebhook: 'outgoingMessageStatus',
        outgoingStatus: 'read',
      },
    })
  })

  it('keeps the top-level chatId on an outgoing status without a message id', async () => {
    const fetch = vi.fn().mockResolvedValue(response({
      receiptId: 43,
      body: { typeWebhook: 'outgoingMessageStatus', chatId: '79998887766', status: 'noAccount' },
    }))
    const client = createGreenApiClient({ apiUrl, fetch })

    await expect(client.receiveNotification(credentials)).resolves.toEqual({
      receiptId: 43,
      notification: { typeWebhook: 'outgoingMessageStatus', chatId: '79998887766', outgoingStatus: 'noAccount' },
    })
  })

  it('treats an empty receive response as empty rather than a message', async () => {
    const fetch = vi.fn().mockResolvedValue(response(null))
    const client = createGreenApiClient({ apiUrl, fetch })

    await expect(client.receiveNotification(credentials)).resolves.toEqual({ kind: 'empty' })
  })

  it('preserves a valid receipt even when its notification body is incomplete', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ receiptId: 7, body: { unknown: true } }))
    const client = createGreenApiClient({ apiUrl, fetch })

    await expect(client.receiveNotification(credentials)).resolves.toEqual({
      receiptId: 7,
      notification: undefined,
    })
  })

  it('deletes the current numeric receipt and exposes a false result', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ result: false }))
    const client = createGreenApiClient({ apiUrl, fetch })

    await expect(client.deleteNotification(credentials, 42)).resolves.toEqual({ deleted: false })
    expect(fetch).toHaveBeenCalledWith(
      `${apiUrl}/waInstance${encodeURIComponent(credentials.instanceId)}/deleteNotification/${encodeURIComponent(credentials.apiToken)}/42`,
      { method: 'DELETE', signal: undefined },
    )
  })

  it.each(['getContactInfo', 'sendMessage', 'receiveNotification', 'deleteNotification'])(
    'returns a safe error for a non-OK %s response',
    async (method) => {
      const fetch = vi.fn().mockResolvedValue(response('token leaked in body', { status: 401 }))
      const client = createGreenApiClient({ apiUrl, fetch })

      const request =
        method === 'getContactInfo'
          ? client.getContactInfo(credentials, '79998887766@c.us')
          : method === 'sendMessage'
          ? client.sendMessage(credentials, '79998887766@c.us', 'Привет')
          : method === 'receiveNotification'
            ? client.receiveNotification(credentials)
            : client.deleteNotification(credentials, 42)

      await expect(request).rejects.toMatchObject({ kind: 'terminal', status: 401 })
      await request.catch(expectSafeError)
    },
  )

  it('does not leak credentials for malformed JSON or through console calls', async () => {
    const fetch = vi.fn().mockResolvedValue(response('not json'))
    const client = createGreenApiClient({ apiUrl, fetch })
    const consoleError = vi.spyOn(console, 'error')

    await expect(client.sendMessage(credentials, '79998887766@c.us', 'Привет')).rejects.toMatchObject({
      kind: 'terminal',
    })
    await client.sendMessage(credentials, '79998887766@c.us', 'Привет').catch(expectSafeError)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
