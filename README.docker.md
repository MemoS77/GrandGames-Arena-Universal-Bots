# Docker Deployment Guide

## Структура проекта

```
.
├── Dockerfile              # Образ на базе Ubuntu 24 + Node.js 24
├── docker-compose.yml      # Конфигурация для запуска двух ботов
├── .env.docker            # Пример переменных окружения
├── .dockerignore          # Исключения при сборке образа
├── ubuntu/                # Папка с движками и вспомогательными файлами
│   ├── engine1/
│   ├── engine2/
│   └── ...
└── conf/docker/           # Конфигурационные файлы для Docker
    ├── Bot1.json
    └── Bot2.json
```

## Подготовка

### 1. Сборка приложения

Перед созданием Docker образа необходимо собрать приложение:

```bash
npm run build
```

Это создаст папку `dist/` с собранным кодом.

### 2. Подготовка конфигурационных файлов

Создайте конфигурационные файлы в `conf/docker/`:

**conf/docker/Bot1.json:**
```json
{
  "botToken": "your-bot1-token-here",
  "serverUrl": "https://your-server.com",
  "engines": [
    {
      "game": "chess",
      "command": "./bots_files/stockfish/stockfish",
      "initCommands": ["setoption name Threads value 2"]
    }
  ]
}
```

**conf/docker/Bot2.json:**
```json
{
  "botToken": "your-bot2-token-here",
  "serverUrl": "https://your-server.com",
  "engines": [
    {
      "game": "connect6",
      "command": "./bots_files/connect6/engine",
      "initCommands": ["varDepth"]
    }
  ]
}
```

### 3. Настройка переменных окружения

Скопируйте `.env.docker` в `.env` и отредактируйте:

```bash
cp .env.docker .env
```

Отредактируйте `.env` и вставьте содержимое ваших конфигов в одну строку:

```env
BOT1_CONFIG={"botToken":"token1","serverUrl":"https://server.com","engines":[...]}
BOT2_CONFIG={"botToken":"token2","serverUrl":"https://server.com","engines":[...]}
```

## Запуск

### Сборка образа

```bash
docker-compose build
```

### Запуск всех ботов

```bash
docker-compose up -d
```

### Запуск одного конкретного бота

```bash
docker-compose up -d bot1
```

### Просмотр логов

```bash
# Все боты
docker-compose logs -f

# Конкретный бот
docker-compose logs -f bot1
```

### Остановка

```bash
docker-compose down
```

### Перезапуск

```bash
docker-compose restart
```

## Альтернативный способ (монтирование файлов)

Если не хотите использовать переменные окружения, можно монтировать файлы напрямую.

Измените `docker-compose.yml`:

```yaml
services:
  bot1:
    # ...
    volumes:
      - ./conf/docker/Bot1.json:/app/conf.json:ro
    # Уберите environment.BOT_CONFIG
```

И измените `Dockerfile`, убрав скрипт копирования конфига.

## Отладка

### Войти в контейнер

```bash
docker exec -it arena-bot-1 /bin/bash
```

### Проверить конфигурацию

```bash
docker exec arena-bot-1 cat /app/conf.json
```

### Проверить права на файлы

```bash
docker exec arena-bot-1 ls -la /app/bots_files
```

### Проверить версию Node.js

```bash
docker exec arena-bot-1 node --version
```

## Масштабирование

Для запуска большего количества ботов добавьте новые сервисы в `docker-compose.yml`:

```yaml
  bot3:
    build: .
    container_name: arena-bot-3
    environment:
      - BOT_CONFIG=${BOT3_CONFIG}
    # ...
```

## Мониторинг ресурсов

```bash
docker stats arena-bot-1 arena-bot-2
```

## Очистка

```bash
# Остановить и удалить контейнеры
docker-compose down

# Удалить образы
docker-compose down --rmi all

# Удалить volumes (если используются)
docker-compose down -v
```

## Production рекомендации

1. **Используйте конкретные версии образов** вместо `latest`
2. **Настройте health checks** в docker-compose.yml
3. **Ограничьте ресурсы** (CPU, память) для каждого контейнера
4. **Используйте secrets** для токенов вместо переменных окружения
5. **Настройте логирование** с ротацией логов
6. **Используйте restart policies** для автоматического перезапуска

Пример health check:

```yaml
services:
  bot1:
    # ...
    healthcheck:
      test: ["CMD", "node", "-e", "process.exit(0)"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```
