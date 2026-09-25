import { useState } from 'react'

import { getRuntimeConfig } from './config/runtime'

type AppProps = {
  apiUrl?: string
}

export function App({ apiUrl }: AppProps) {
  const configuration = getRuntimeConfig(apiUrl)
  const [instanceId, setInstanceId] = useState('')
  const [apiToken, setApiToken] = useState('')

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

  return (
    <main className="app-shell">
      <section className="connection-card" aria-labelledby="app-title">
        <p className="eyebrow">GREEN-API demo</p>
        <h1 id="app-title">Telegram text chat</h1>
        <p className="intro">
          Подключите отдельный авторизованный инстанс с пустым webhookUrl и включёнными
          входящими уведомлениями
        </p>

        <form
          className="connection-form"
          onSubmit={(event) => {
            event.preventDefault()
          }}
        >
          <label htmlFor="instance-id">ID инстанса</label>
          <input
            id="instance-id"
            name="instanceId"
            value={instanceId}
            onChange={(event) => setInstanceId(event.target.value)}
            autoComplete="off"
            inputMode="numeric"
            required
          />

          <label htmlFor="api-token">API token инстанса</label>
          <input
            id="api-token"
            name="apiToken"
            type="password"
            value={apiToken}
            onChange={(event) => setApiToken(event.target.value)}
            autoComplete="off"
            required
          />

          <p className="hint">
            Данные остаются только в памяти этой вкладки. Прямые browser-запросы требуют
            разрешённый CORS со стороны GREEN-API
          </p>
          <button type="submit">Продолжить</button>
        </form>
      </section>
    </main>
  )
}
