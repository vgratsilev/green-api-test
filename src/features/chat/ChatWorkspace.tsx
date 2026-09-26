import { useRef, useState, type SubmitEvent } from 'react'

import type { createGreenApiClient } from '../../api/greenApi'
import type { GreenApiCredentials, IncomingNotification, OutgoingMessageStatus } from '../../domain/chat'
import { useChatContact } from './useChatContact'
import { useNotificationPolling } from './useNotificationPolling'

type ChatWorkspaceProps = {
  client: ReturnType<typeof createGreenApiClient>
  credentials: GreenApiCredentials
  phone: string
  onReturnToConnection: () => void
}

type IncomingMessage = { id: string; text: string; direction: 'incoming' }
type OutgoingState = 'sending' | 'delivered' | 'read' | 'failed'
type OutgoingMessage = { id: string; text: string; direction: 'outgoing'; state: OutgoingState; sentAt: number }
type Message = IncomingMessage | OutgoingMessage

export function ChatWorkspace({ client, credentials, phone, onReturnToConnection }: ChatWorkspaceProps) {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const temporaryId = useRef(0)
  const pendingStatuses = useRef(new Map<string, OutgoingMessageStatus>())
  const sendInFlight = useRef(false)

  const { contactName, avatarUrl, clearAvatar } = useChatContact({ client, credentials, phone })

  const { status: pollingStatus, retry } = useNotificationPolling({
    client,
    credentials,
    phone,
    onIncoming(notification: IncomingNotification) {
      setMessages((current) => {
        if (!notification.idMessage || !notification.text || current.some((message) => message.id === notification.idMessage)) {
          return current
        }

        return [...current, { id: notification.idMessage, text: notification.text, direction: 'incoming' }]
      })
    },
    onOutgoingStatus({ idMessage, status }) {
      setMessages((current) => {
        const messageIndex = idMessage
          ? current.findIndex((message) => message.direction === 'outgoing' && message.id === idMessage)
          : findLastSendingMessage(current)
        if (messageIndex < 0) {
          if (idMessage && sendInFlight.current) cachePendingStatus(pendingStatuses.current, idMessage, status)
          return current
        }

        const message = current[messageIndex] as OutgoingMessage
        const nextState = stateFromRemoteStatus(message.state, status)
        if (nextState === message.state) return current

        const nextMessages = [...current]
        nextMessages[messageIndex] = { ...message, state: nextState }
        return nextMessages
      })
    },
  })

  async function sendMessage(text: string, retryId?: string) {
    if (sendInFlight.current) return

    const localId = retryId ?? `sending-${temporaryId.current++}`

    sendInFlight.current = true
    setMessages((current) => retryId
      ? current.map((message) => message.direction === 'outgoing' && message.id === retryId
        ? { ...message, state: 'sending' }
        : message)
      : [...current, { id: localId, text, direction: 'outgoing', state: 'sending', sentAt: Date.now() }])
    setError('')
    setIsSending(true)
    try {
      const result = await client.sendMessage(credentials, `${phone}@c.us`, text)
      const pendingStatus = pendingStatuses.current.get(result.idMessage)
      pendingStatuses.current.clear()
      setMessages((current) => current.map((message) => message.direction === 'outgoing' && message.id === localId
        ? { ...message, id: result.idMessage, state: pendingStatus ? stateFromRemoteStatus('sending', pendingStatus) : 'sending' }
        : message))
      if (!retryId) setDraft('')
    } catch {
      pendingStatuses.current.clear()
      setMessages((current) => current.map((message) => message.direction === 'outgoing' && message.id === localId
        ? { ...message, state: 'failed' }
        : message))
      setError('Не удалось отправить сообщение. Черновик сохранён; повторите отправку вручную.')
    } finally {
      sendInFlight.current = false
      setIsSending(false)
    }
  }

  function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.trim() || draft.length > 4096 || isSending) return
    void sendMessage(draft)
  }

  const invalidDraft = draft.trim().length === 0 || draft.length > 4096
  const displayName = contactName || `+${phone}`
  const avatarInitial = displayName.trim().charAt(0).toLocaleUpperCase('ru-RU') || '?'

  return (
    <section className="chat-workspace" aria-labelledby="chat-title">
      <header className="chat-header">
        <p className="eyebrow">Личный чат</p>
        <h1 id="chat-title">
          {avatarUrl
            ? <img className="chat-avatar" data-testid="chat-avatar" src={avatarUrl} alt="" onError={clearAvatar} />
            : <span className="chat-avatar chat-avatar--fallback" data-testid="chat-avatar" aria-hidden="true">{avatarInitial}</span>}
          <span>{displayName}</span>
        </h1>
      </header>
      <div className="message-list" aria-label="Сообщения">
        {messages.length === 0 ? <p className="empty-state">Сообщений пока нет.</p> : messages.map((message) => (
          <article className={`message message--${message.direction}`} key={message.id}>
            <p>
              {message.text}
              {message.direction === 'outgoing' && (
                <span className="message-meta">
                <time aria-label="Время отправки" dateTime={new Date(message.sentAt).toISOString()}>{formatMessageTime(message.sentAt)}</time>
                <MessageStatus message={message} disabled={isSending} onRetry={() => void sendMessage(message.text, message.id)} />
                </span>
              )}
            </p>
          </article>
        ))}
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
      {pollingStatus === 'retry-exhausted' && <div className="notice" role="alert"><p>Не удалось продолжить получение сообщений.</p><button type="button" onClick={retry}>Повторить polling</button></div>}
      {pollingStatus === 'terminal' && <div className="notice" role="alert"><p>Получение сообщений остановлено. Проверьте подключение.</p><button type="button" onClick={onReturnToConnection}>Вернуться к подключению</button></div>}
      <form className="composer" onSubmit={send}>
        <label htmlFor="message-text">Сообщение</label>
        <textarea id="message-text" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4097} aria-describedby="message-hint" />
        <p id="message-hint" className="hint">До 4096 символов</p>
        <button type="submit" disabled={invalidDraft || isSending}>{isSending ? 'Отправка…' : 'Отправить'}</button>
      </form>
    </section>
  )
}

function MessageStatus({ message, disabled, onRetry }: { message: OutgoingMessage; disabled: boolean; onRetry: () => void }) {
  if (message.state === 'sending') return <span className="message-status message-status--sending" role="status" aria-label="Отправляется" />
  if (message.state === 'delivered') return <CheckIcon label="Доставлено" />
  if (message.state === 'read') return <CheckIcon label="Прочитано" double />
  return <button className="message-status message-status--failed" type="button" aria-label="Повторить отправку" title="Повторить отправку" disabled={disabled} onClick={onRetry}>↻</button>
}

function CheckIcon({ label, double = false }: { label: string; double?: boolean }) {
  return (
    <svg className="message-status message-status--check" aria-label={label} viewBox="0 0 16 12" role="img">
      {double && <path d="m.5 6.5 3.5 3.5 6-8" />}
      <path d={double ? 'm6.5 6.5 3.5 3.5 6-8' : 'm.5 6.5 3.5 3.5 6-8'} />
    </svg>
  )
}

function stateFromRemoteStatus(current: OutgoingState, status: OutgoingMessageStatus): OutgoingState {
  if (current === 'failed' || current === 'read') return current
  if (status === 'failed' || status === 'noAccount') return 'failed'
  if (status === 'read') return 'read'
  return 'delivered'
}

function findLastSendingMessage(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.direction === 'outgoing' && message.state === 'sending') return index
  }
  return -1
}

function cachePendingStatus(statuses: Map<string, OutgoingMessageStatus>, idMessage: string, status: OutgoingMessageStatus) {
  if (statuses.size === 20 && !statuses.has(idMessage)) {
    const oldestId = statuses.keys().next().value
    if (oldestId !== undefined) statuses.delete(oldestId)
  }
  statuses.set(idMessage, status)
}

function formatMessageTime(timestamp: number) {
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
