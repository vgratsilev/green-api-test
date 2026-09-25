import { useState, type SubmitEvent } from 'react'

import type { createGreenApiClient } from '../../api/greenApi'
import type { GreenApiCredentials } from '../../domain/chat'

type ChatWorkspaceProps = {
  client: ReturnType<typeof createGreenApiClient>
  credentials: GreenApiCredentials
  phone: string
}

type Message = { id: string; text: string }

export function ChatWorkspace({ client, credentials, phone }: ChatWorkspaceProps) {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')

  async function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.trim() || draft.length > 4096 || isSending) return

    setError('')
    setIsSending(true)
    try {
      const result = await client.sendMessage(credentials, `${phone}@c.us`, draft)
      setMessages((current) => [...current, { id: result.idMessage, text: draft }])
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
        {messages.length === 0 ? <p className="empty-state">Сообщений пока нет.</p> : messages.map((message) => <article className="message message--outgoing" key={message.id}><p>{message.text}</p><span>В очереди</span></article>)}
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
      <form className="composer" onSubmit={send}>
        <label htmlFor="message-text">Сообщение</label>
        <textarea id="message-text" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4097} aria-describedby="message-hint" />
        <p id="message-hint" className="hint">До 4096 символов</p>
        <button type="submit" disabled={invalidDraft || isSending}>{isSending ? 'Отправка…' : 'Отправить'}</button>
      </form>
    </section>
  )
}
