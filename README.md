# Telegram text chat

Минимальный React-клиент для одного личного текстового чата через GREEN-API.

## Local start

1. Установите Node.js 20+ и выполните `npm ci`.
2. Скопируйте `.env.example` в `.env.local`.
3. Укажите в `VITE_GREEN_API_URL` публичный HTTPS host из консоли GREEN-API — без `idInstance` и token.
4. Запустите `npm run dev` и введите `idInstance` и API token только в форме браузера.

Перед подключением используйте отдельный авторизованный инстанс: `webhookUrl` должен быть пустым, а входящие уведомления и статусы исходящих сообщений включены (`outgoingWebhook`). У него не должно быть других consumers HTTP-очереди во время demo.

Доступ передаётся в запросах GREEN-API, поэтому значения не сохраняются в localStorage, URL или исходном коде. Browser-only режим работает только если GREEN-API разрешает CORS для origin приложения; не публикуйте credentials в `.env`, screenshots или commits.

## Quality checks

```sh
npm run lint
npm run test
npm run build
```
