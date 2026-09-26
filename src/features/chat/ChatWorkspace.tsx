import { useState, type SubmitEvent } from 'react'

import type { createGreenApiClient } from '../../api/greenApi'
import type { GreenApiCredentials, IncomingNotification } from '../../domain/chat'
import { useNotificationPolling } from './useNotificationPolling'

type ChatWorkspaceProps = {
  client: ReturnType<typeof createGreenApiClient>
  credentials: GreenApiCredentials
  phone: string
  onReturnToConnection: () => void
}

type Message = { id: string; text: string; direction: 'incoming' | 'outgoing' }

export function ChatWorkspace({ client, credentials, phone, onReturnToConnection }: ChatWorkspaceProps) {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')

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
  })

  async function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.trim() || draft.length > 4096 || isSending) return

    setError('')
    setIsSending(true)
    try {
      const result = await client.sendMessage(credentials, `${phone}@c.us`, draft)
      setMessages((current) => [...current, { id: result.idMessage, text: draft, direction: 'outgoing' }])
      setDraft('')
    } catch {
      setError('Не удалось отправить сообщение. Черновик сохранён; повторите отправку вручную.')
    } finally {
      setIsSending(false)
    }
  }

  const invalidDraft = draft.trim().length === 0 || draft.length > 4096

  return (
    <section className="chat-workspace" aria-labelledby="chat-title">
      <header className="chat-header"><p className="eyebrow">Личный чат</p><h1 id="chat-title">+{phone}</h1></header>
      <div className="message-list" aria-label="Сообщения">
        {messages.length === 0 ? <p className="empty-state">Сообщений пока нет.</p> : messages.map((message) => (
          <article className={`message message--${message.direction}`} key={message.id}>
            <p>{message.text}</p>
            {message.direction === 'outgoing' && <span>В очереди</span>}
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
