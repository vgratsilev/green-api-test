# Диаграммы проекта

Диаграммы описывают реализованный клиент, а не целевую архитектуру. Они хранятся в Mermaid, поэтому GitHub рендерит их прямо в этом документе, а изменения можно просматривать в обычном diff.

## 1. Компоненты и внешние границы

```mermaid
flowchart LR
  User[Пользователь] --> App[App]
  App --> Runtime[getRuntimeConfig]
  App --> Form[ConnectionForm]
  Runtime -->|default public API origin| Form
  Form --> Country[CountryCombobox]
  Form -->|API origin + credentials + phone| App
  App -->|confirmed connection, cached messages and contact| Workspace[ChatWorkspace]
  Workspace -->|updated messages and contact snapshot| App

  Workspace --> Contact[useChatContact]
  Workspace --> Polling[useNotificationPolling]
  Workspace --> Client[GREEN-API client]
  Contact --> Client
  Polling --> Client
  Client --> API[GREEN-API HTTP API]
  API <--> Telegram[Telegram]
  App -->|creates client with API origin| Client
```

`ConnectionForm` принимает точный публичный HTTPS API origin из консоли инстанса. `App` сохраняет origin, credentials и номер только в состоянии вкладки после успешного preflight через `getStateInstance`; значения не записываются в URL, localStorage, environment variables или репозиторий. Приложение поддерживает один активный личный текстовый чат.

## 2. Диаграмма классов и типов

```mermaid
classDiagram
  class App {
    -connection
    -chatSnapshots: record keyed by sessionKey
    -contactSnapshots: record keyed by sessionKey
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
    +getStateInstance(credentials)
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
    +initialContact: ContactSnapshot
    +onContactChange(contact)
  }

  class ContactSnapshot {
    +contactName: string
    +avatarUrl: string
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
  App --> ContactSnapshot : stores by chat key
  App --> GreenApiClient : preflight and creates
  ConnectionForm --> App : submits connection values
  ChatWorkspace --> GreenApiClient : uses
  ChatWorkspace --> useChatContact : uses
  ChatWorkspace --> useNotificationPolling : uses
  useChatContact --> ContactSnapshot : reads and updates
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
  ConnectionForm --> Chat: authorized getStateInstance
  Chat --> Chat: send or receive message
  Chat --> RetryPolling: retryable errors exhausted
  RetryPolling --> Chat: Retry polling
  Chat --> TerminalPolling: terminal polling error
  TerminalPolling --> ConnectionForm: Return to connection
  Chat --> ConnectionForm: Return to connection
  Chat --> [*]: page reload
  ConnectionForm --> [*]: page reload
```

Reloading the page intentionally ends the session: its credentials exist only in React state.
`App` keeps message arrays and contact display snapshots in memory, keyed by API origin, instance ID, and recipient phone. Reopening a chat restores both immediately; reloading the page clears both. The contact snapshot contains only the name and avatar URL. `contactChatId` is used for receipt classification only after a fresh `GetContactInfo` response.

## 4. Переходы состояния исходящего сообщения

```mermaid
stateDiagram-v2
  [*] --> Pending: submit draft
  Pending --> Sending: send queue starts job
  Sending --> Queued: SendMessage returns idMessage
  Sending --> Failed: SendMessage fails
  Queued --> Delivered: outgoingMessageStatus delivered
  Queued --> Read: outgoingMessageStatus read
  Queued --> Failed: outgoingMessageStatus failed or noAccount
  Delivered --> Read: outgoingMessageStatus read
  Delivered --> Failed: outgoingMessageStatus failed or noAccount
  Failed --> Pending: retry
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
  UI->>UI: Добавляет локальное сообщение (pending)
  UI->>UI: Ставит задачу в последовательную очередь отправки
  UI->>UI: Начинает отправку задачи (sending)
  UI->>Client: sendMessage(credentials, phone@c.us, text)
  Client->>API: POST /sendMessage
  API-->>Client: { idMessage }
  Client-->>UI: idMessage
  UI->>UI: Меняет состояние на queued
  API-->>Recipient: Доставляет сообщение в Telegram
```

При ошибке запроса сообщение остаётся в чате со статусом `failed`, а черновик остаётся в поле ввода. Повторная отправка возвращает сообщение в очередь со статусом `pending`; задачи отправляются последовательно.

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
      alt Получен receipt
        Hook->>Hook: Сохраняет receiptId и notification
      else Очередь пуста
        Hook->>Hook: Сразу начинает следующий receive
      end
    else Есть receiptId
      Hook->>Hook: Классифицирует notification
      alt Подходящее входящее текстовое сообщение
        Hook-->>UI: onIncoming(notification)
        UI->>UI: Добавляет входящее сообщение без дубликата
      else Статус исходящего сообщения
        Hook-->>UI: onOutgoingStatus(notification)
        UI->>UI: Обновляет status исходящего сообщения
      else Уведомление не подходит для активного чата
        Hook->>Hook: Игнорирует notification
      else Для скрытого номера ещё загружается контакт
        Hook->>Hook: Откладывает обработку и сохраняет receipt
      end
      opt Receipt классифицирован
        Hook->>Client: deleteNotification(credentials, receiptId)
        Client->>API: DELETE /deleteNotification/{receiptId}
        API-->>Client: { result: boolean }
        Client-->>Hook: deleted
        Hook->>Hook: Очищает receiptId
      end
    end
  end
```

Один polling run выполняет только одну операцию с очередью одновременно. При остановке hook отменяет запрос; новый run ожидает завершения старой операции, чтобы не читать и не удалять уведомления параллельно. Если для входящего сообщения со скрытым номером ещё не загружена контактная идентичность, hook сохраняет receipt и откладывает классификацию. Разрешённый ответ DELETE завершает receipt даже при `result: false`; повторяемая ошибка сохраняет его для повтора. Повторяемые ошибки получают задержки 1, 2 и 4 секунды; затем UI предлагает ручной перезапуск.

## 7. Восстановление заголовка чата

```mermaid
sequenceDiagram
  participant App
  participant UI as ChatWorkspace
  participant Hook as useChatContact
  participant Client as GREEN-API client
  participant API as GREEN-API HTTP API

  App-->>UI: Передаёт сообщения и сохранённые name/avatar по ключу чата
  UI->>Hook: initialContact
  Hook-->>UI: Сразу возвращает сохранённые name/avatar со статусом loading
  UI->>UI: Отображает имя и аватар из снимка
  Hook->>Client: getContactInfo(credentials, phone@c.us)
  Client->>API: POST /getContactInfo
  API-->>Client: contactName, name, avatar, chatId
  Client-->>Hook: Данные контакта
  Hook->>Hook: Проверяет и обновляет отображаемый контакт
  Hook-->>UI: Новый снимок через onContactChange
  UI-->>App: Сохраняет снимок по ключу чата
```

Снимок используется для мгновенного отображения имени и аватара, пока выполняется запрос. Ошибка поиска не убирает уже сохранённые данные с экрана. `contactChatId` не восстанавливается из снимка: он становится доступен polling только после свежей проверки.

## Проверка актуальности

При изменении `src/App.tsx`, `src/api/greenApi.ts`, `src/features/chat/useChatContact.ts`, `src/features/chat/useNotificationPolling.ts`, `src/features/chat/ChatWorkspace.tsx` или границ компонентов обновите соответствующую диаграмму в этом документе. Поведение polling дополнительно зафиксировано в [решении о порядке receipt](../solutions/logic-errors/polling-run-receipt-ordering.md).
