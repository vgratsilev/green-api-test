# Telegram text chat

Тестовое задание: React-клиент для одного личного чата в Telegram через [GREEN-API](https://green-api.com/telegram). Приложение позволяет подключить инстанс, открыть чат по номеру телефона, отправлять и получать текстовые сообщения в интерфейсе, стилизованном под Telegram.

## Возможности

- Подключение по `idInstance` и `apiTokenInstance`.
- Создание личного чата по номеру телефона в международном формате.
- Отправка текстовых сообщений и повторная отправка при ошибке.
- Получение входящих сообщений через HTTP API GREEN-API.
- Отображение статусов исходящего сообщения: отправляется, в очереди, доставлено, прочитано или ошибка.
- Адаптивный интерфейс для мобильных и десктопных экранов.

## Технологии

- React 19, TypeScript и Vite;
- GREEN-API HTTP API: `SendMessage`, `ReceiveNotification`, `DeleteNotification`, `GetContactInfo`;
- Vitest и React Testing Library;
- ESLint.

## Онлайн-демо

[Открыть приложение](https://vgratsilev.github.io/green-api-test/).

Для проверки потребуется отдельный авторизованный инстанс GREEN-API и номер собеседника. Данные доступа вводятся в форме и исчезают после перезагрузки страницы.

## Диаграммы

[Диаграммы архитектуры, типов, состояний и последовательностей](docs/diagrams/README.md) показывают поток подключения, отправки и получения сообщений. GitHub рендерит Mermaid-диаграммы прямо в документе.

## Локальный запуск

Требуется Node.js 20+.

```sh
npm ci
cp .env.example .env.local
```

В `.env.local` укажите публичный HTTPS host из консоли GREEN-API:

```dotenv
VITE_GREEN_API_URL=https://api.green-api.com
```

Не добавляйте в этот файл `idInstance` или API token. Затем запустите приложение:

```sh
npm run dev
```

Откройте адрес, который покажет Vite (обычно `http://localhost:5173`), и введите ID инстанса, API token и номер получателя.

Используйте отдельный авторизованный инстанс: `webhookUrl` должен быть пустым, а входящие уведомления и статусы исходящих сообщений — включены. У HTTP-очереди не должно быть других consumers.

## Безопасность и CORS

ID инстанса и token нужны для запросов GREEN-API, поэтому они существуют только в памяти вкладки. Приложение не сохраняет их в `localStorage`, URL или исходном коде. Не добавляйте credentials в `.env`, скриншоты или коммиты.

Клиент работает в браузере, поэтому GREEN-API должен разрешать CORS для origin приложения. Перед использованием проверьте на выделенном инстансе запросы `GET ReceiveNotification`, `POST SendMessage` и `DELETE DeleteNotification`.

## GitHub Pages

Workflow [deploy-pages.yml](.github/workflows/deploy-pages.yml) собирает и публикует приложение при push в `main`; его также можно запустить вручную через **Actions → Deploy GitHub Pages → Run workflow**. Перед первым запуском в **Settings → Pages** выберите **GitHub Actions** как источник публикации.

Во время публикации workflow задаёт Vite base path репозитория. Локальная разработка остаётся на `/`, а production-сборку можно проверить так:

```sh
VITE_BASE_PATH=/green-api-test/ npm run build
```

## Проверки

```sh
npm run lint
npm run test
npm run build
VITE_BASE_PATH=/green-api-test/ npm run build
```
