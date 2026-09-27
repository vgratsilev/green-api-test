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

**Публичная версия:** [Telegram text chat](https://vgratsilev.github.io/green-api-test/). Для работы введите ID и API token отдельного авторизованного инстанса с пустым `webhookUrl` и включёнными входящими уведомлениями, затем номер собеседника. Данные доступа вводятся только в форме и исчезают после перезагрузки вкладки.

Во время deploy workflow передаёт Vite repository base path, поэтому локальная разработка остаётся на `/`, а production assets загружаются из `/<repository>/`. Проверить production build можно так:

```sh
VITE_BASE_PATH=/green-api-test/ npm run build
```

Публичная ссылка подтверждена [успешным Pages deployment](https://github.com/vgratsilev/green-api-test/actions/runs/36306142320). 2026-09-27 страница и её JS/CSS загрузились без 404; из Pages origin тестовое сообщение было отправлено, получило статус «Прочитано», а ответ появился в чате без ошибки polling. Это проверяет рабочий цикл `GET ReceiveNotification`, JSON `POST SendMessage` и `DELETE DeleteNotification` для тестового инстанса. После изменения API host или настроек инстанса повторите CORS smoke check с Pages origin.

## Quality checks

```sh
npm run lint
npm run test
npm run build
VITE_BASE_PATH=/green-api-test/ npm run build
```
