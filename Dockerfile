# Используем Ubuntu 24.04 как базовый образ
FROM ubuntu:24.04

# Устанавливаем необходимые зависимости и Node.js 24
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Создаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем собранный код приложения (должен быть собран локально: npm run build)
COPY dist ./dist

# Примечание: папка ubuntu монтируется через volume в docker-compose.yml
# Если нужен самодостаточный образ без volumes, раскомментируйте:
# COPY ubuntu ./ubuntu
# RUN find ./ubuntu -type f -exec chmod +x {} \;

# Запускаем приложение
CMD ["node", "dist/bundle.js"]
