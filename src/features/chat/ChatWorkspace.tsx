import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type SubmitEvent } from 'react'

import type { createGreenApiClient } from '../../api/greenApi'
import { MAX_MESSAGE_LENGTH, type GreenApiCredentials, type IncomingNotification, type OutgoingMessageStatus } from '../../domain/chat'
import { useChatContact } from './useChatContact'
import { useNotificationPolling } from './useNotificationPolling'

type ChatWorkspaceProps = {
  client: ReturnType<typeof createGreenApiClient>
  credentials: GreenApiCredentials
  phone: string
  initialMessages?: ChatMessage[]
  onMessagesChange?: (messages: ChatMessage[]) => void
  onReturnToConnection: () => void
}

type IncomingMessage = { id: string; text: string; direction: 'incoming'; receivedAt: number }
type OutgoingState = 'pending' | 'sending' | 'queued' | 'delivered' | 'read' | 'failed'
type OutgoingMessage = { id: string; text: string; direction: 'outgoing'; state: OutgoingState; sentAt: number }
export type ChatMessage = IncomingMessage | OutgoingMessage
type SendJob = { localId: string; text: string; retryId?: string; draftSnapshot?: string }

export function ChatWorkspace({ client, credentials, phone, initialMessages = [], onMessagesChange, onReturnToConnection }: ChatWorkspaceProps) {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [error, setError] = useState('')
  const temporaryId = useRef(0)
  const pendingStatuses = useRef(new Map<string, OutgoingMessageStatus>())
  const sendQueue = useRef<SendJob[]>([])
  const sendProcessing = useRef(false)
  const messageListRef = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)

  useEffect(() => {
    onMessagesChange?.(messages)
  }, [messages, onMessagesChange])

  useLayoutEffect(() => {
    const list = messageListRef.current
    if (list && nearBottom.current) list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight)
  }, [messages])

  function trackScroll() {
    const list = messageListRef.current
    if (list) nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight <= 80
  }

  const { contactName, avatarUrl, contactChatId, status: contactStatus, retry: retryContactLookup, clearAvatar } = useChatContact({ client, credentials, phone })

  const { status: pollingStatus, retry } = useNotificationPolling({
    client,
    credentials,
    phone,
    contactStatus,
    contactChatId,
    onIncoming(notification: IncomingNotification) {
      setMessages((current) => {
        if (!notification.idMessage || !notification.text || current.some((message) => message.id === notification.idMessage)) {
          return current
        }

        return [...current, { id: notification.idMessage, text: notification.text, direction: 'incoming', receivedAt: notification.timestamp ?? Date.now() }]
      })
    },
    onOutgoingStatus({ idMessage, status }) {
      setMessages((current) => {
        if (!idMessage) return current
        const messageIndex = current.findIndex((message) => message.direction === 'outgoing' && message.id === idMessage)
        if (messageIndex < 0) {
          if (sendProcessing.current) cachePendingStatus(pendingStatuses.current, idMessage, status)
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

  function enqueueMessage(text: string, retryId?: string, draftSnapshot?: string) {
    const localId = `sending-${temporaryId.current++}`
    setMessages((current) => retryId
      ? current.map((message) => message.direction === 'outgoing' && message.id === retryId
        ? { ...message, id: localId, state: 'pending' }
        : message)
      : [...current, { id: localId, text, direction: 'outgoing', state: 'pending', sentAt: Date.now() }])
    setError('')
    sendQueue.current.push({ localId, text, retryId, draftSnapshot })
    void processSendQueue()
  }

  async function processSendQueue() {
    if (sendProcessing.current) return
    sendProcessing.current = true
    try {
      while (sendQueue.current.length > 0) {
        const job = sendQueue.current.shift()
        if (job) await sendMessage(job)
      }
    } finally {
      sendProcessing.current = false
    }
  }

  async function sendMessage({ localId, text, retryId, draftSnapshot }: SendJob) {
    setMessages((current) => current.map((message) => message.direction === 'outgoing' && message.id === localId
      ? { ...message, state: 'sending' }
      : message))
    try {
      const result = await client.sendMessage(credentials, `${phone}@c.us`, text)
      const pendingStatus = pendingStatuses.current.get(result.idMessage)
      pendingStatuses.current.delete(result.idMessage)
      setMessages((current) => current.map((message) => message.direction === 'outgoing' && message.id === localId
        ? { ...message, id: result.idMessage, state: pendingStatus ? stateFromRemoteStatus('queued', pendingStatus) : 'queued' }
        : message))
      if (draftSnapshot !== undefined) setDraft((current) => current === draftSnapshot ? '' : current)
      setError('')
    } catch {
      setMessages((current) => current.map((message) => message.direction === 'outgoing' && message.id === localId
        ? { ...message, id: retryId ?? localId, state: 'failed' }
        : message))
      setError(retryId
        ? 'Не удалось повторно отправить сообщение. Повторите вручную.'
        : 'Не удалось отправить сообщение. Черновик сохранён; повторите отправку вручную.')
    }
  }

  function submitDraft() {
    const text = draft.trim()
    if (!text || draft.length > MAX_MESSAGE_LENGTH || text.length > MAX_MESSAGE_LENGTH) return
    enqueueMessage(text, undefined, draft)
  }

  function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    submitDraft()
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submitDraft()
  }

  const invalidDraft = draft.trim().length === 0 || draft.length > MAX_MESSAGE_LENGTH || draft.trim().length > MAX_MESSAGE_LENGTH
  const displayName = contactName || `+${phone}`
  const avatarInitial = displayName.trim().charAt(0).toLocaleUpperCase('ru-RU') || '?'

  return (
    <section className="chat-workspace" aria-labelledby="chat-title">
      <header className="chat-header">
        <div className="chat-header-title">
          <button className="chat-return" type="button" aria-label="Вернуться к подключению" title="Вернуться к подключению" onClick={onReturnToConnection}>
            <svg className="chat-return-icon" aria-hidden="true" viewBox="0 0 16 16">
              <path d="m9.5 3-5 5 5 5" />
            </svg>
          </button>
          <p className="eyebrow">Личный чат</p>
        </div>
        <h1 id="chat-title">
          {avatarUrl
            ? <img className="chat-avatar" data-testid="chat-avatar" src={avatarUrl} alt="" onError={clearAvatar} />
            : <span className="chat-avatar chat-avatar--fallback" data-testid="chat-avatar" aria-hidden="true">{avatarInitial}</span>}
          <span>{displayName}</span>
        </h1>
      </header>
      <div className="message-list" aria-label="Сообщения" onScroll={trackScroll} ref={messageListRef}>
        {messages.length === 0 ? <p className="empty-state">Сообщений пока нет.</p> : messages.map((message) => (
          <article className={`message message--${message.direction}`} key={message.id}>
            <p>
              {message.text}
              {message.direction === 'incoming' && (
                <span className="message-meta">
                  <time aria-label="Время получения" dateTime={new Date(message.receivedAt).toISOString()}>{formatMessageTime(message.receivedAt)}</time>
                </span>
              )}
              {message.direction === 'outgoing' && (
                <span className="message-meta">
                <time aria-label="Время отправки" dateTime={new Date(message.sentAt).toISOString()}>{formatMessageTime(message.sentAt)}</time>
                <MessageStatus message={message} disabled={message.state === 'sending'} onRetry={() => enqueueMessage(message.text, message.id)} />
                </span>
              )}
            </p>
          </article>
        ))}
      </div>
      {error && <p className="notice" id="send-error" role="alert">{error}</p>}
      {contactStatus === 'unavailable' && <div className="notice" role="status" aria-live="polite"><p>Не удалось подтвердить контакт. Сообщения со скрытым номером удерживаются в очереди.</p><button type="button" onClick={retryContactLookup}>Повторить поиск контакта</button></div>}
      {pollingStatus === 'retry-exhausted' && <div className="notice" role="alert"><p>Не удалось продолжить получение сообщений.</p><button type="button" onClick={retry}>Повторить polling</button></div>}
      {pollingStatus === 'terminal' && <div className="notice" role="alert"><p>Получение сообщений остановлено. Проверьте подключение.</p><button type="button" onClick={onReturnToConnection}>Вернуться к подключению</button></div>}
      <form className="composer" onSubmit={send}>
        <label htmlFor="message-text">Сообщение</label>
        <textarea id="message-text" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown} maxLength={MAX_MESSAGE_LENGTH} aria-describedby={error ? 'message-hint send-error' : 'message-hint'} />
        <p id="message-hint" className="hint">До {MAX_MESSAGE_LENGTH} символов</p>
        <button type="submit" disabled={invalidDraft}>Отправить</button>
      </form>
    </section>
  )
}

function MessageStatus({ message, disabled, onRetry }: { message: OutgoingMessage; disabled: boolean; onRetry: () => void }) {
  if (message.state === 'pending') return <span className="message-status message-status--pending" role="status">Ожидает отправки</span>
  if (message.state === 'sending') return <span className="message-status message-status--sending" role="status" aria-label="Отправляется" />
  if (message.state === 'queued') return <span className="message-status message-status--queued" role="status">В очереди</span>
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
