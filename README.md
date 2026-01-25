# SMS Automation - OpenPhone + N8N

Сервис автоматической отправки SMS через OpenPhone с интеграцией N8N.

## Что это?

Node.js/TypeScript сервис, который:
- Принимает запросы на отправку SMS через webhook
- Автоматически отправляет SMS через веб-интерфейс OpenPhone (Playwright)
- Отправляет callback в N8N с результатом
- Логирует всё в Supabase

## Быстрый старт

### 1. Установка

```bash
cd sms-automation
npm install
```

### 2. Настройка `.env`

```env
# OpenPhone
OPENPHONE_EMAIL=your_email@example.com
OPENPHONE_PASSWORD=your_password

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_key

# N8N Webhook (callback URL)
N8N_WEBHOOK_URL=https://your-n8n.cloud/webhook/xxx

# Server
PORT=3000
NODE_ENV=production
HEADLESS=true
```

### 3. Запуск

```bash
# Компиляция TypeScript
npm run build

# Запуск
npm start
```

Или через Docker:
```bash
docker-compose up -d --build
```

## API

### POST /webhook/send
Отправить одно SMS.

```json
{
  "phone": "+1234567890",
  "text": "Текст сообщения",
  "external_id": "order_123"
}
```

### POST /webhook/send-batch
Отправить несколько SMS.

```json
{
  "messages": [
    { "phone": "+1234567890", "text": "Сообщение 1", "external_id": "id1" },
    { "phone": "+0987654321", "text": "Сообщение 2", "external_id": "id2" }
  ]
}
```

### GET /health
Проверка состояния сервиса.

### GET /queue/status
Статус очереди.

### POST /queue/pause | /queue/resume | /queue/clear
Управление очередью.

## Callback в N8N

После каждого SMS автоматически отправляется callback:

```json
{
  "success": true,
  "status": "sent",
  "phone": "+1234567890",
  "external_id": "order_123",
  "timestamp": "2026-01-17T10:30:45.123Z",
  "attempt": 1,
  "duration_ms": 15234,
  "screenshot_urls": ["https://..."]
}
```

При ошибке:
```json
{
  "success": false,
  "status": "failed",
  "error": { "code": "TIMEOUT", "message": "Navigation timeout" }
}
```

## Структура проекта

```
sms-automation/
├── src/
│   ├── config/index.ts          # Конфигурация
│   ├── server/app.ts            # Express API
│   ├── services/
│   │   ├── openphone.service.ts # Playwright автоматизация
│   │   ├── queue.service.ts     # Очередь с retry
│   │   ├── supabase.service.ts  # Логирование
│   │   └── n8n-webhook.service.ts # Callback в N8N
│   ├── types/index.ts           # TypeScript типы
│   ├── utils/                   # Утилиты
│   └── index.ts                 # Точка входа
├── dist/                        # Скомпилированный JS
├── logs/                        # Логи
├── screenshots/                 # Скриншоты
├── .env                         # Конфигурация (не в git!)
├── docker-compose.yml           # Docker
└── Dockerfile
```

## Документация

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Развертывание и деплой
- [N8N_INTEGRATION.md](./N8N_INTEGRATION.md) - Интеграция с N8N
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Архитектура системы

## Скрипты

| Файл | Описание |
|------|----------|
| `start.bat` | Запуск на Windows |
| `deploy-update.bat` | Деплой обновлений на сервер |
| `check-server-status.bat` | Проверка статуса сервера |

## Тестирование

```bash
# Проверка здоровья
curl http://localhost:3000/health

# Отправка тестового SMS
curl -X POST http://localhost:3000/webhook/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "+1234567890", "text": "Test", "external_id": "test_1"}'
```

## Troubleshooting

### "Login failed"
- Проверьте email/пароль в `.env`
- При 2FA: запустите с `HEADLESS=false`, пройдите 2FA вручную

### Браузер не запускается
```bash
npx playwright install chrome
npx playwright install-deps chrome
```

### Порт занят
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```
