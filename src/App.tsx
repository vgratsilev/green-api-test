import { useState } from 'react'

import { createGreenApiClient } from './api/greenApi'
import { getRuntimeConfig } from './config/runtime'
import type { GreenApiCredentials } from './domain/chat'
import { ChatWorkspace } from './features/chat/ChatWorkspace'
import { ConnectionForm } from './features/connection/ConnectionForm'

type AppProps = {
  apiUrl?: string
}

export function App({ apiUrl }: AppProps) {
  const configuration = getRuntimeConfig(apiUrl)
  const [connection, setConnection] = useState<{ credentials: GreenApiCredentials; phone: string }>()

  if ('error' in configuration) {
    return (
      <main className="app-shell">
        <section className="connection-card" aria-labelledby="app-title">
          <p className="eyebrow">GREEN-API demo</p>
          <h1 id="app-title">Telegram text chat</h1>
          <p className="notice" role="alert">
            {configuration.error}
          </p>
        </section>
      </main>
    )
  }

  if (connection) {
    return <main className="app-shell"><ChatWorkspace client={createGreenApiClient({ apiUrl: configuration.apiUrl })} {...connection} onReturnToConnection={() => setConnection(undefined)} /></main>
  }

  return (
    <main className="app-shell">
      <section className="connection-card" aria-labelledby="app-title">
        <p className="eyebrow">GREEN-API demo</p>
        <h1 id="app-title">Telegram text chat</h1>
        <p className="intro">
          Подключите отдельный авторизованный инстанс с пустым webhookUrl и включёнными
          входящими уведомлениями
        </p>

        <ConnectionForm onConnect={(credentials, phone) => setConnection({ credentials, phone })} />
      </section>
    </main>
  )
}
