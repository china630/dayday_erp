# DayDay ERP — развёртывание в production (Ubuntu 24.04 + Docker Compose)

Цель: поднять стек из `docker-compose.prod.yml`:
- Postgres (`db`)
- Redis (`redis`)
- NestJS API (`api`)
- Next.js Web (`web`)

Документ обновлён под:
- **Node.js 22** (образы `apps/api/Dockerfile`, `apps/web/Dockerfile`)
- **Prisma ORM 7** + **`prisma.config.ts`** + **driver adapter** (`@prisma/adapter-pg`)
- Требование **HTTPS** для production web-origin (см. `TZ.md` §1)

---

## 0. Быстрый чек-лист перед стартом

- Есть домен и будет настроен HTTPS (Caddy/nginx/Traefik) → трафик на `web:3000`.
- В корне репозитория будет `.env` (шаблон: `env.production.example`).
- Вы понимаете, что `NEXT_PUBLIC_*` переменные **вшиваются в клиентский бандл на этапе build**.
- На сервере открыт только нужный внешний порт (обычно 80/443); Postgres/Redis наружу не публикуем.

---

## 1. SSH

```bash
ssh deploy@YOUR_SERVER_IP
```

---

## 2. Docker (Ubuntu 24.04)

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"${VERSION_CODENAME:-noble}\") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Перезайди в SSH или выполни `newgrp docker`, затем:

```bash
docker version
docker compose version
```

---

## 3. Git

```bash
sudo apt-get install -y git
```

---

## 4. Клонирование репозитория

```bash
sudo mkdir -p /opt/dayday_erp
sudo chown "$USER":"$USER" /opt/dayday_erp
cd /opt/dayday_erp
git clone YOUR_GIT_URL .
```

---

## 5. Production `.env` (корень репозитория)

```bash
cp env.production.example .env
nano .env
```

### Минимально обязательные переменные

- **Postgres**:
  - `POSTGRES_PASSWORD` (обязательна)
  - опционально `POSTGRES_USER`, `POSTGRES_DB`
- **API**:
  - `REDIS_URL=redis://redis:6379`
  - `JWT_SECRET`, `JWT_REFRESH_SECRET`
  - `AUDIT_HASH_SECRET` (рекомендуется)
  - `CORS_ORIGINS=https://your-domain.tld` (можно несколько через запятую)
- **Web**:
  - `NEXT_PUBLIC_API_URL=http://api:4000` (для сборки/SSR внутри сети Compose)

### Часто нужные опции (рекомендуется настроить до публичного запуска)

- **Storage (логотипы, PDF)**:
  - production: `STORAGE_DRIVER=s3` + `S3_*`
  - альтернативно: `STORAGE_DRIVER=local` + `STORAGE_LOCAL_ROOT`
- **SMTP**:
  - `SMTP_HOST` + `SMTP_*` — без этого письма не отправляются
- **Sentry**:
  - API: `SENTRY_DSN_API`
  - Web client: `NEXT_PUBLIC_SENTRY_DSN`
  - sourcemaps upload для web build: `SENTRY_UPLOAD_SOURCEMAPS=1` + `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT_WEB`

### Важно про `NEXT_PUBLIC_*`

`NEXT_PUBLIC_*` попадают в Next.js bundle **во время** `docker build` (см. `apps/web/Dockerfile`). Если меняете эти значения — нужно **пересобрать образ web**.

---

## 6. Первый запуск стека

Из корня (где лежит `docker-compose.prod.yml`):

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Логи:

```bash
docker compose -f docker-compose.prod.yml logs -f api web
```

---

## 7. Prisma 7: миграции и первичная инициализация

В этом репозитории Prisma настроена через `packages/database/prisma.config.ts`.
В production миграции применяем **только** командой `prisma migrate deploy` (никаких `migrate dev`).

### 7.0. Maintenance mode перед миграциями (рекомендуется)

Перед `db:migrate:deploy` включайте maintenance mode, чтобы пользователи не работали в момент изменения схемы.

- Готовые файлы в репозитории:
  - `docs/maintenance.html` — страница обслуживания (AZ/RU)
  - `docs/nginx-maintenance.conf` — сниппет Nginx (возвращает 503 при наличии `/var/www/html/maintenance.enable`)

Пример последовательности на сервере:

```bash
# 1) разово: положить maintenance.html и подключить nginx-сниппет
sudo cp /opt/dayday_erp/docs/maintenance.html /var/www/html/maintenance.html
# include /opt/dayday_erp/docs/nginx-maintenance.conf; внутри server { ... }

# 2) включить maintenance
sudo touch /var/www/html/maintenance.enable
sudo nginx -t && sudo systemctl reload nginx

# 3) миграции/инициализация
docker compose -f docker-compose.prod.yml exec api npm run db:migrate:deploy
docker compose -f docker-compose.prod.yml exec api npm run db:prod-init

# 4) выключить maintenance
sudo rm -f /var/www/html/maintenance.enable
sudo nginx -t && sudo systemctl reload nginx
```

### 7.1. Миграции (обязательно)

```bash
docker compose -f docker-compose.prod.yml exec api npm run db:migrate:deploy
```

### 7.2. Идемпотентная “доводка” платформенных данных (рекомендуется)

```bash
docker compose -f docker-compose.prod.yml exec api npm run db:prod-init
```

Примечание: `db:prod-init` должен быть идемпотентным; это не “reset”.

---

## 8. HTTPS (обязательно для production)

Production web-origin должен быть **HTTPS**.

Рекомендация: поставить Caddy или nginx и проксировать:
- `https://your-domain.tld` → `http://127.0.0.1:3000` (контейнер `web`)

API можно не публиковать отдельно: браузер ходит через тот же origin `/api/*` (Next rewrites).

---

## 9. Проверки после деплоя

- `GET /api/health` через публичный web-origin (например `https://your-domain.tld/api/health`)
- Логин/регистрация в UI
- Проверка, что переводы подгружаются (нет ошибок `Failed to fetch`/`Unexpected end of JSON input`)

---

## 10. Типовые проблемы

- **`npm install` / `prisma generate` падает из-за `DATABASE_URL`**: убедитесь, что `.env` в корне и `DATABASE_URL`/`POSTGRES_*` заданы корректно (в compose `DATABASE_URL` для `api` собирается автоматически).
- **Windows локально: ENOTEMPTY/EPERM в `.next`**: остановить `next dev`, запустить `npm run clean -w @dayday/web`, повторить build; добавить исключение антивируса для `apps/web/.next`.

---

## 11. Runbook: «снести дроплет и поднять заново» (без данных)

Сценарий подходит, если в production нет бизнес-данных и можно безболезненно пересоздать сервер.

### 11.1. На новой машине (Ubuntu 24.04)

1) Установи Docker и Git (см. разделы 2–3).
2) Клонируй репозиторий в `/opt/dayday_erp`.
3) Подготовь `.env`:

```bash
cd /opt/dayday_erp
cp env.production.example .env
nano .env
```

Минимум: `POSTGRES_PASSWORD`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`, `NEXT_PUBLIC_API_URL`.

### 11.2. Поднять стек + миграции

```bash
cd /opt/dayday_erp
docker compose -f docker-compose.prod.yml up -d --build

docker compose -f docker-compose.prod.yml exec api npm run db:migrate:deploy
docker compose -f docker-compose.prod.yml exec api npm run db:prod-init
```

### 11.3. Проверки

- Web открывается по HTTPS.
- `GET https://your-domain.tld/api/health` отдаёт 200.
- Логин/регистрация работают.

### 11.4. Если нужно повторить «с нуля»

Остановить и удалить контейнеры и данные:

```bash
cd /opt/dayday_erp
docker compose -f docker-compose.prod.yml down -v
```

Затем снова выполнить шаги из 11.2.
