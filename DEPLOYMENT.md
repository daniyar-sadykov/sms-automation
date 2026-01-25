# Развертывание SMS Automation

## Локальный запуск

### 1. Установка

```bash
cd sms-automation
npm install
```

### 2. Настройка `.env`

```bash
cp .env.example .env
# Заполните значения
```

**Обязательные параметры:**
- `OPENPHONE_EMAIL` - email от OpenPhone
- `OPENPHONE_PASSWORD` - пароль
- `SUPABASE_URL` - URL Supabase проекта
- `SUPABASE_KEY` - API ключ Supabase
- `N8N_WEBHOOK_URL` - URL webhook в N8N (опционально)

### 3. Компиляция и запуск

```bash
npm run build
npm start
```

## Docker развертывание

### Локально

```bash
docker-compose up -d --build
```

### На сервере

```bash
# 1. Скопировать проект
scp -r sms-automation/ user@server:/opt/

# 2. На сервере
cd /opt/sms-automation
docker-compose up -d --build

# 3. Проверка
docker-compose logs -f
```

## Деплой обновлений

### Автоматический (через скрипт)

```bash
# Windows
deploy-update.bat
```

### Ручной деплой

#### Шаг 1: Компиляция
```bash
npm run build
```

#### Шаг 2: Копирование на сервер

**Вариант A: SCP**
```bash
scp dist/services/openphone.service.js root@SERVER_IP:/opt/sms-automation/dist/services/
```

**Вариант B: WinSCP/FileZilla**
1. Подключиться к серверу
2. Перейти в `/opt/sms-automation/dist/services/`
3. Загрузить файлы из `dist/`

**Вариант C: Через SSH + nano**
```bash
ssh root@SERVER_IP
cd /opt/sms-automation/dist/services
nano openphone.service.js
# Вставить содержимое, сохранить (Ctrl+O, Ctrl+X)
```

#### Шаг 3: Перезапуск

```bash
ssh root@SERVER_IP "cd /opt/sms-automation && docker-compose restart"
```

#### Шаг 4: Проверка

```bash
ssh root@SERVER_IP "cd /opt/sms-automation && docker-compose logs --tail=50"
```

## Настройка Supabase

Создайте таблицу для логов:

```sql
CREATE TABLE IF NOT EXISTS message_logs (
  id BIGSERIAL PRIMARY KEY,
  message_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  phone VARCHAR(50) NOT NULL,
  text_hash VARCHAR(64),
  status VARCHAR(20) NOT NULL,
  attempt INTEGER DEFAULT 1,
  error_code VARCHAR(100),
  error_text TEXT,
  screenshot_path VARCHAR(500),
  external_id VARCHAR(255),
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_message_logs_external_id ON message_logs(external_id);
CREATE INDEX idx_message_logs_timestamp ON message_logs(message_timestamp DESC);
CREATE INDEX idx_message_logs_status ON message_logs(status);
```

## Мониторинг

### Логи

```bash
# Все логи
tail -f logs/combined.log

# Только ошибки
tail -f logs/error.log

# Docker
docker-compose logs -f
```

### Скриншоты

Сохраняются в `screenshots/`:
- `before-send-*.png` - перед отправкой
- `after-send-*.png` - после отправки
- `error-*.png` - при ошибках

## Troubleshooting

### "Login failed"
1. Проверьте email/пароль в `.env`
2. Попробуйте войти вручную в браузере
3. При 2FA: первый вход с `HEADLESS=false`

### "N8N webhook disabled"
Добавьте `N8N_WEBHOOK_URL` в `.env`

### Браузер не запускается

**Docker:**
```bash
docker-compose up -d --build
```

**Локально:**
```bash
npx playwright install chrome
npx playwright install-deps chrome
```

### Сообщения не отправляются
1. Проверьте очередь: `curl http://localhost:3000/queue/status`
2. Проверьте логи: `tail -f logs/error.log`
3. Посмотрите скриншоты в `screenshots/`
4. Удалите `storageState.json` и перезапустите

## Production рекомендации

1. **Мониторинг** - алерты на ошибки в логах
2. **Backup** - регулярный backup Supabase
3. **Rate limiting** - ограничьте запросы к API
4. **Reverse proxy** - nginx/Caddy перед сервисом
5. **SSL** - HTTPS для webhook endpoint
6. **Безопасность** - не коммитьте `.env` в git
