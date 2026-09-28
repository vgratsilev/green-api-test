import { useCallback, useEffect, useRef, useState } from 'react'

import { createGreenApiClient } from './api/greenApi'
import { getRuntimeConfig } from './config/runtime'
import { ChatWorkspace, type ChatMessage } from './features/chat/ChatWorkspace'
import { ConnectionForm, type ConnectionValues } from './features/connection/ConnectionForm'

type AppProps = {
  apiUrl?: string
}

type ConfirmedConnection = ConnectionValues & {
  client: ReturnType<typeof createGreenApiClient>
}

export function App({ apiUrl }: AppProps) {
  const configuration = getRuntimeConfig(apiUrl)
  const [connection, setConnection] = useState<ConfirmedConnection>()
  const [isEditingConnection, setIsEditingConnection] = useState(false)
  const chatSnapshotsRef = useRef<Record<string, ChatMessage[]>>({})
  const preflightControllerRef = useRef<AbortController | undefined>(undefined)
  const sessionKey = connection ? getSessionKey(connection) : ''
  const saveChatSnapshot = useCallback((messages: ChatMessage[]) => {
    if (!sessionKey) return

    chatSnapshotsRef.current[sessionKey] = messages
  }, [sessionKey])

  useEffect(() => () => preflightControllerRef.current?.abort(), [])

  async function connect(nextConnection: ConnectionValues): Promise<boolean> {
    const sameConnection = connection
      && connection.apiUrl === nextConnection.apiUrl
      && connection.credentials.instanceId === nextConnection.credentials.instanceId
      && connection.credentials.apiToken === nextConnection.credentials.apiToken
      && connection.phone === nextConnection.phone
    const client = sameConnection ? connection.client : createGreenApiClient({ apiUrl: nextConnection.apiUrl })
    preflightControllerRef.current?.abort()
    const controller = new AbortController()
    preflightControllerRef.current = controller

    try {
      const state = await client.getStateInstance(nextConnection.credentials, controller.signal)
      if (controller.signal.aborted) return false
      if (!state.authorized) return false
      setConnection({ ...nextConnection, client })
      setIsEditingConnection(false)
      return true
    } catch {
      return false
    } finally {
      if (preflightControllerRef.current === controller) preflightControllerRef.current = undefined
    }
  }

  if (connection && !isEditingConnection) {
    return (
      <main className="app-shell">
        <ChatWorkspace
          client={connection.client}
          credentials={connection.credentials}
          phone={connection.phone}
          initialMessages={chatSnapshotsRef.current[sessionKey]}
          onMessagesChange={saveChatSnapshot}
          onReturnToConnection={() => setIsEditingConnection(true)}
        />
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="connection-card" aria-labelledby="app-title">
        <p className="eyebrow">GREEN-API demo</p>
        <h1 id="app-title">Telegram text chat</h1>
        <p className="intro">Подключите GREEN-API, чтобы начать переписку в Telegram.</p>

        <ConnectionForm
          defaultApiUrl={configuration.defaultApiUrl}
          initialConnection={connection}
          onConnect={connect}
        />
      </section>
    </main>
  )
}

function getSessionKey(connection: ConnectionValues): string {
  return [connection.apiUrl, connection.credentials.instanceId, connection.phone].join('\u0000')
}
