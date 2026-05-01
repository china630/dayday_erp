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
- После **каждого** деплоя с новым кодом фронта: не забыть шаг **синхронизации переводов в БД** (§7.3) — иначе `/public/translations` и кэш i18n могут расходиться с бандлом `resources.ts`.

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

#### Вариант A — одна настройка в `.env` (проще всего при типовом деплое)

В корневом `.env` задайте для сервиса `web`:

```bash
MAINTENANCE_MODE=1
```

Поддерживаемые значения: `1`, `true`, `yes`, `on` (без учёта регистра). Выключение: удалите переменную, `0` или `false`.

Пересборка образа `web` **не нужна**; Compose уже пробрасывает переменную в контейнер. Нужен **перезапуск** процесса Next:

```bash
docker compose -f docker-compose.prod.yml up -d web
```

Дальше миграции и инициализация (как в §7.1–7.2), затем снимите `MAINTENANCE_MODE` и снова `up -d web`.

**Ограничение:** ответ 503 отдаёт только контейнер **Next (`web`)**. Запросы, которые не проходят через него (например, отдельно опубликованный порт API на хосте), этой настройкой не отключаются. В таких схемах используйте вариант B.

#### Вариант B — Nginx (или другой reverse proxy) перед приложением

503 на границе HTTPS, до Node/Docker — надёжнее при нестандартной публикации портов.

- `docs/maintenance.html` — страница обслуживания (AZ/RU); для варианта A дублируется в коде (`apps/web/lib/maintenance-page-html.ts`, держите визуально в согласовании при правках).
- `docs/nginx-maintenance.conf` — сниппет: 503, если существует файл-флаг `/var/www/html/maintenance.enable`.

Пример последовательности на сервере:

```bash
# 1) разово: положить maintenance.html и подключить nginx-сниппет
sudo cp /opt/dayday_erp/docs/maintenance.html /var/www/html/maintenance.html
# include /opt/dayday_erp/docs/nginx-maintenance.conf; внутри server { ... }

# 2) включить maintenance
sudo touch /var/www/html/maintenance.enable
sudo nginx -t && sudo systemctl reload nginx

# 3) миграции / i18n / инициализация
docker compose -f docker-compose.prod.yml exec api npm run db:migrate:deploy
docker compose -f docker-compose.prod.yml exec api npm run db:sync-i18n:prune
docker compose -f docker-compose.prod.yml exec api npm run db:prod-init

# 4) выключить maintenance
sudo rm -f /var/www/html/maintenance.enable
sudo nginx -t && sudo systemctl reload nginx
```

### 7.1. Миграции (обязательно)

```bash
docker compose -f docker-compose.prod.yml exec api npm run db:migrate:deploy
```

`DATABASE_URL` и остальные переменные из `.env` на хосте попадают в контейнер через `env_file` в `docker-compose.prod.yml`; отдельный `dotenv-cli` в образе для этих команд не требуется.

### 7.2. Идемпотентная “доводка” платформенных данных (рекомендуется)

```bash
docker compose -f docker-compose.prod.yml exec api npm run db:prod-init
```

Примечание: `db:prod-init` должен быть идемпотентным; это не “reset”. Корневой **`npm run db:prod-init`** (так его вызывают из `docker compose … exec api`) уже включает **`db:migrate:deploy`**, **`db:seed`**, **`db:sync-i18n:prune`** и скрипт **`db:prod-init`** в workspace `@dayday/database` — отдельный §7.3 в этом случае дублирует синхронизацию, но не вредит. Если хотите **явный** порядок без повторного `migrate`/`seed` из корня: выполните §7.1 и §7.3, затем только **`npm run db:prod-init -w @dayday/database`** (доводка платформы без полной цепочки корня).

### 7.3. Синхронизация переводов (i18n) в Postgres — **не пропускать на проде**

Строки **RU/AZ** для UI лежат в **`apps/web/lib/i18n/resources.ts`** (в образ `api` файл копируется при сборке). Таблица **`translation_overrides`** и ответ **`GET /api/public/translations`** должны соответствовать этому словарю: иначе после релиза на проде возможны «старые» подписи или лишние ключи в БД.

**Рекомендуемый шаг после `db:migrate:deploy` на каждом релизе** (идемпотентно, из контейнера `api`, `WORKDIR` = корень монорепо в образе):

```bash
docker compose -f docker-compose.prod.yml exec api npm run db:sync-i18n:prune
```

Что делает команда:

- upsert всех плоских ключей **ru** и **az** из `resources.ts` в **`translation_overrides`**;
- удаляет из **ru/az** строки, ключей которых **больше нет** в `resources.ts` (актуализация после переименований);
- обновляет **`system_config`** ключ **`i18n.cacheVersion`** — клиенты перезапрашивают оверрайды.

**Альтернатива одной строкой** (миграции + синхронизация i18n с prune; без seed):

```bash
docker compose -f docker-compose.prod.yml exec api npm run db:deploy
```

Если нужен только upsert **без** удаления устаревших ключей (редко на проде): `npm run db:sync-i18n` — см. [TZ.md](../TZ.md) §17.

Связь с CI: перед сборкой образов выполняйте **`npm run i18n:audit`** и при изменении `resources.ts` — **`npm run i18n:catalog`** (обновление `apps/api/src/admin/i18n-default-catalog-data.json`); подробности — **PRD §7.6.1**, **TZ §17**.

---

## 8. HTTPS (обязательно для production)

Production web-origin должен быть **HTTPS**.

### 8.1. Рекомендуемый путь: Caddy (быстрее всего)

```bash
sudo apt-get update
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
```

Создайте `/etc/caddy/Caddyfile`:

```caddy
your-domain.tld {
  reverse_proxy 127.0.0.1:3000
}
```

Применение:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

Caddy автоматически выпустит/обновит Let's Encrypt сертификат.

### 8.2. Альтернатива: Nginx

Остаётся валидным: `https://your-domain.tld` → `http://127.0.0.1:3000` (контейнер `web`).

API можно не публиковать отдельно: браузер ходит через тот же origin `/api/*` (Next rewrites).

---

## 9. Проверки после деплоя

- `GET /api/health` через публичный web-origin (например `https://your-domain.tld/api/health`)
- Логин/регистрация в UI
- Проверка, что переводы подгружаются (нет ошибок `Failed to fetch`/`Unexpected end of JSON input`)
- После шага §7.3: `GET /api/public/translations?locale=ru` (и `az`) — не пустой объект при ожидании полного зеркала; при смене языка в UI строки совпадают с ожидаемым релизом (при расхождении повторите `db:sync-i18n:prune` и сброс кэша браузера)

---

## 10. Типовые проблемы

- **`npm install` / `prisma generate` падает из-за `DATABASE_URL`**: убедитесь, что `.env` в корне и `DATABASE_URL`/`POSTGRES_*` заданы корректно (в compose `DATABASE_URL` для `api` собирается автоматически).
- **Windows локально: ENOTEMPTY/EPERM в `.next`**: остановить `next dev`, запустить `npm run clean -w @dayday/web`, повторить build; добавить исключение антивируса для `apps/web/.next`.
- **На проде «старые» подписи или сырые ключи i18n после деплоя**: не выполнен §7.3 — запустите `docker compose -f docker-compose.prod.yml exec api npm run db:sync-i18n:prune` (или `db:deploy` сразу после миграций). Локально: из корня репозитория `npx dotenv-cli -e .env -o -- npm run db:sync-i18n` (без prune) или `… db:sync-i18n:prune`.

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
docker compose -f docker-compose.prod.yml exec api npm run db:sync-i18n:prune
docker compose -f docker-compose.prod.yml exec api npm run db:prod-init
```

Команда `db:prod-init` из корня в `package.json` уже включает migrate + seed + **prune-синк i18n**; здесь шаг **`db:sync-i18n:prune`** перед `db:prod-init` даёт явный порядок «схема → словарь → остальная инициализация» и совпадает с типовым деплоем из §7.

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
