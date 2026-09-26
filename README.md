# Telegram text chat

Минимальный React-клиент для одного личного текстового чата через GREEN-API.

## Local start

Prerequisite: Node.js 20+.

```sh
npm ci
cp .env.example .env.local
```

В `.env.local` укажите только публичный HTTPS host из консоли GREEN-API:

```dotenv
VITE_GREEN_API_URL=https://api.green-api.com
```

Не добавляйте в этот файл `idInstance` или API token. Затем выполните `npm run dev`, откройте адрес, показанный Vite (обычно `http://localhost:5173`), и введите ID и token только в форме браузера.

Перед подключением используйте отдельный авторизованный инстанс: `webhookUrl` должен быть пустым, а входящие уведомления и статусы исходящих сообщений включены (`outgoingWebhook`). Во время demo у HTTP-очереди не должно быть других consumers.

Доступ передаётся в запросах GREEN-API, поэтому ID и token существуют только в памяти вкладки и исчезают после reload. Они не сохраняются в localStorage, URL или исходном коде. `.env.local` игнорируется Git; не публикуйте credentials в `.env`, screenshots или commits.

Browser-only режим работает, только если GREEN-API разрешает CORS для origin приложения. Перед использованием чата проверьте с development origin читаемый `GET ReceiveNotification`, JSON `POST SendMessage` и `DELETE DeleteNotification` на выделенном test instance.

## GitHub Pages

Workflow `.github/workflows/deploy-pages.yml` собирает `dist` и публикует его при push в `main` или через **Actions → Deploy GitHub Pages → Run workflow**. Владельцу репозитория перед первым запуском нужно выбрать **Settings → Pages → Build and deployment → GitHub Actions**.

Во время deploy workflow передаёт Vite repository base path, поэтому локальная разработка остаётся на `/`, а production assets загружаются из `/<repository>/`. Проверить production build можно так:

```sh
VITE_BASE_PATH=/green-api-test/ npm run build
```

После успешного workflow откройте его deployment output `page_url`: это единственный источник фактической публичной ссылки. Не добавляйте её в README как working service, пока shell приложения не откроется и с final Pages origin не пройдут те же `GET ReceiveNotification`, JSON `POST SendMessage` и `DELETE DeleteNotification` CORS smoke checks. Development-origin проверка не заменяет эту проверку.

## Quality checks

```sh
npm run lint
npm run test
npm run build
VITE_BASE_PATH=/green-api-test/ npm run build
```
