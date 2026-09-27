# Диаграммы проекта

Диаграммы описывают реализованный клиент, а не целевую архитектуру. Они хранятся в Mermaid, поэтому GitHub рендерит их прямо в этом документе, а изменения можно просматривать в обычном diff.

## 1. Компоненты и внешние границы

```mermaid
flowchart LR
  User[Пользователь] --> App[App]
  App --> Runtime[getRuntimeConfig]
  App --> Form[ConnectionForm]
  Form --> Country[CountryCombobox]
  Form -->|credentials + phone| Workspace[ChatWorkspace]

  Workspace --> Contact[useChatContact]
  Workspace --> Polling[useNotificationPolling]
  Workspace --> Client[GREEN-API client]
  Contact --> Client
  Polling --> Client
  Client --> API[GREEN-API HTTP API]
  API <--> Telegram[Telegram]

  Runtime --> Env[VITE_GREEN_API_URL]
```

`App` сохраняет credentials и номер только в состоянии вкладки. В переменной окружения находится лишь публичный HTTPS host API; credentials не записываются в URL, localStorage или репозиторий.

## 2. Диаграмма классов и типов

```mermaid
classDiagram
  class App {
    -connection
    +render()
  }

  class ConnectionForm {
    +onConnect(credentials, phone)
  }

  class ChatWorkspace {
    -messages: Message[]
    -draft: string
    +sendMessage(text, retryId)
  }

  class GreenApiCredentials {
    +instanceId: string
    +apiToken: string
  }

  class IncomingNotification {
    +idMessage: string
    +typeWebhook: string
    +chatId: string
    +outgoingStatus: OutgoingMessageStatus
    +text: string
  }

  class ReceivedNotification {
    +receiptId: number
    +notification: IncomingNotification
  }

  class GreenApiClient {
    +getContactInfo(credentials, chatId)
    +sendMessage(credentials, chatId, message)
    +receiveNotification(credentials)
    +deleteNotification(credentials, receiptId)
  }

  class GreenApiError {
    +kind: GreenApiErrorKind
    +status: number
  }

  class GreenApiErrorKind {
    <<enumeration>>
    abort
    retryable
    terminal
  }

  class useChatContact {
    +contactName: string
    +avatarUrl: string
    +contactChatId: string
  }

  class useNotificationPolling {
    +status: PollingStatus
    +retry()
  }

  class PollingStatus {
    <<enumeration>>
    polling
    retry-exhausted
    terminal
  }

  App --> ConnectionForm
  App --> ChatWorkspace
  ConnectionForm --> GreenApiCredentials : creates
  ChatWorkspace --> GreenApiClient : uses
  ChatWorkspace --> useChatContact : uses
  ChatWorkspace --> useNotificationPolling : uses
  useChatContact --> GreenApiClient : getContactInfo
  useNotificationPolling --> GreenApiClient : receive/delete
  GreenApiClient --> GreenApiCredentials
  GreenApiClient --> ReceivedNotification
  ReceivedNotification --> IncomingNotification
  GreenApiClient ..> GreenApiError : throws
  GreenApiError --> GreenApiErrorKind
  useNotificationPolling --> PollingStatus
```

## 3. Состояния пользовательской сессии

```mermaid
stateDiagram-v2
  [*] --> ConnectionForm
  ConnectionForm --> ConnectionForm: invalid phone
  ConnectionForm --> Chat: valid credentials and phone
  Chat --> Chat: send or receive message
  Chat --> RetryPolling: retryable errors exhausted
  RetryPolling --> Chat: Retry polling
  Chat --> TerminalPolling: terminal polling error
  TerminalPolling --> ConnectionForm: Return to connection
  Chat --> ConnectionForm: Return to connection
  ConnectionForm --> [*]: page reload
```

Reloading the page intentionally ends the session: its credentials exist only in React state.

## 4. Переходы состояния исходящего сообщения

```mermaid
stateDiagram-v2
  [*] --> Sending: submit draft
  Sending --> Queued: SendMessage returns idMessage
  Sending --> Failed: SendMessage fails
  Queued --> Delivered: outgoingMessageStatus delivered
  Queued --> Read: outgoingMessageStatus read
  Queued --> Failed: outgoingMessageStatus failed or noAccount
  Delivered --> Read: outgoingMessageStatus read
  Delivered --> Failed: outgoingMessageStatus failed or noAccount
  Failed --> Sending: retry
  Read --> [*]
```

Если webhook-статус приходит раньше ответа `SendMessage`, `ChatWorkspace` временно кэширует его по `idMessage`, затем применяет после создания сообщения.

## 5. Последовательность отправки текста

```mermaid
sequenceDiagram
  actor User as Пользователь
  participant UI as ChatWorkspace
  participant Client as GREEN-API client
  participant API as GREEN-API HTTP API
  participant Recipient as Telegram получателя

  User->>UI: Вводит текст и нажимает Отправить
  UI->>UI: Добавляет локальное сообщение (sending)
  UI->>Client: sendMessage(credentials, phone@c.us, text)
  Client->>API: POST /sendMessage
  API-->>Client: { idMessage }
  Client-->>UI: idMessage
  UI->>UI: Меняет состояние на queued
  API-->>Recipient: Доставляет сообщение в Telegram
```

При ошибке запросов новое сообщение удаляется, черновик остаётся в поле ввода. При повторной отправке существующее failed-сообщение возвращается в `sending`.

## 6. Получение уведомлений и подтверждение очереди

```mermaid
sequenceDiagram
  participant Hook as useNotificationPolling
  participant Client as GREEN-API client
  participant API as GREEN-API HTTP API
  participant UI as ChatWorkspace

  loop Пока polling активен
    alt Нет ожидающего receiptId
      Hook->>Client: receiveNotification(credentials)
      Client->>API: GET /receiveNotification?receiveTimeout=5
      API-->>Client: empty или receipt + notification
      Client-->>Hook: result
      alt Подходящее входящее текстовое сообщение
        Hook-->>UI: onIncoming(notification)
        UI->>UI: Добавляет входящее сообщение без дубликата
      else Статус исходящего сообщения
        Hook-->>UI: onOutgoingStatus(notification)
        UI->>UI: Обновляет status исходящего сообщения
      end
      Hook->>Hook: Сохраняет receiptId
    else Есть receiptId
      Hook->>Client: deleteNotification(credentials, receiptId)
      Client->>API: DELETE /deleteNotification/{receiptId}
      API-->>Client: { result: true }
      Client-->>Hook: deleted
      Hook->>Hook: Очищает receiptId
    end
  end
```

Один polling run выполняет только одну операцию с очередью одновременно. При остановке hook отменяет запрос; новый run ожидает завершения старой операции, чтобы не читать и не удалять уведомления параллельно. Повторяемые ошибки получают задержки 1, 2 и 4 секунды; затем UI предлагает ручной перезапуск.

## Проверка актуальности

При изменении `src/api/greenApi.ts`, `src/features/chat/useNotificationPolling.ts`, `src/features/chat/ChatWorkspace.tsx` или границ компонентов обновите соответствующую диаграмму в этом документе. Поведение polling дополнительно зафиксировано в [решении о порядке receipt](../solutions/logic-errors/polling-run-receipt-ordering.md).
