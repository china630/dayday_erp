# DayDay / ERA ERP — развёртывание в production (Ubuntu 24.04 + Docker Compose)

Инструкция для владельца сервера: поднять стек из `docker-compose.prod.yml` (Postgres, Redis, NestJS API, Next.js).

Англоязычный оригинал: [deploy.md](./deploy.md).

## 1. Подключение по SSH

С рабочей машины (подставьте свои значения):

```bash
ssh -i /path/to/key.pem deploy@YOUR_SERVER_IP
```

Или по паролю (менее безопасно):

```bash
ssh deploy@129.212.170.185
```

## 2. Установка Docker на чистую Ubuntu 24.04

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME:-noble}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Выйдите из сессии и войдите снова (или выполните `newgrp docker`), чтобы применилась группа `docker`. Проверка:

```bash
docker version
docker compose version
```

## 3. Установка Git

```bash
sudo apt-get install -y git
```

## 4. Клонирование репозитория

```bash
sudo mkdir -p /opt/dayday_erp
sudo chown "$USER":"$USER" /opt/dayday_erp
cd /opt/dayday_erp
git clone YOUR_GIT_URL .
```

Подставьте вместо `YOUR_GIT_URL` URL вашего удалённого репозитория (HTTPS или SSH), например `https://github.com/<org>/<repo>.git` или `git@github.com:<org>/<repo>.git`.

## 5. Файл окружения (`.env`)

В корне репозитория:

```bash
cp env.production.example .env
nano .env
```

Если в репозитории по-прежнему есть только `.env.example`, используйте его; актуальный шаблон для production — **`env.production.example`** в корне монорепо.

### Обязательно и настоятельно рекомендуется

| Переменная / тема | Пояснение |
|-------------------|-----------|
| `POSTGRES_PASSWORD` | **Обязательна** для `docker-compose.prod.yml` (без неё Compose не запустит стек). |
| `REDIS_URL` | **Обязательна в `.env`** для сервиса `api` (Compose не подставляет её сам). Для Redis из этого compose: `redis://redis:6379`. Не используйте URL read-replica для очередей Bull. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Длинные случайные значения; не повторяйте секреты из разработки. |
| `COMPOSE_PROJECT_NAME` | Рекомендуется задать (например `dayday_prod`), чтобы имя сети Docker было предсказуемым и совпадало с шагом миграций ниже. |
| `CORS_ORIGINS` | В production без подходящего origin браузер не сможет вызывать API с вашего сайта. |
| `NODE_ENV` | Должно быть `production` и для API, и для web (Compose также выставляет это для сервисов приложений). |

### URL и порты (Compose)

- **Web (хост → контейнер):** `PORT` — порт на хосте мапится на порт контейнера `3000` (по умолчанию `3000`). Пример: `PORT=80` откроет интерфейс на 80-м порту хоста.
- **API (хост → контейнер):** `API_PUBLISH_PORT` (по умолчанию `4000`) → `API_PORT` (по умолчанию `4000`) внутри контейнера API.
- **Публикация Postgres / Redis:** `POSTGRES_PUBLISH_PORT` (по умолчанию `5432`), `REDIS_PUBLISH_PORT` (по умолчанию `6379`). На «закрытом» сервере можно убрать проброс портов в compose, если с БД и Redis работают только контейнеры.

### Связка приложений

- **`DATABASE_URL` в `.env`:** для сервиса `api` Compose **переопределяет** `DATABASE_URL` адресом сервиса `db` внутри сети Docker. В стандартной схеме править вручную не нужно.
- **`REDIS_URL`:** задаётся **только в `.env`** (Compose больше не переопределяет). Для Redis из этого же `docker-compose.prod.yml` укажите `REDIS_URL=redis://redis:6379` (хост `redis` — имя сервиса в сети Compose).
- **`NEXT_PUBLIC_API_URL`:** по умолчанию в Compose — `http://api:4000`, чтобы сервер Next.js ходил в API по внутренней сети (rewrites и серверные запросы). Браузер ходит на тот же origin через `/api/...`; меняйте значение только если понимаете разницу серверных и клиентских URL.
- **`CORS_ORIGINS`:** в production API разрешает origin из этого списка через запятую (плюс localhost по умолчанию). Укажите публичный адрес сайта, например `https://erp.example.com`.

### Аварийный обход модулей (`EMERGENCY_MODULE_ACCESS_EMAIL`)

В текущем коде **нет** отдельной production-переменной, которая включает или выключает этот обход. Обход для фиксированного dev-email **отключён при `NODE_ENV=production`** (см. `apps/api/src/subscription/subscription-access.service.ts`). Для боя нужно:

- Держать для API **`NODE_ENV=production`**.
- Не запускать стек с `NODE_ENV=development` на публичном сервере.

## 6. Миграции БД (до или сразу после первого старта API)

Рекомендуемый путь на сервере: **`bash scripts/deploy-prod-db-migrate.sh`** (поднимает стек и выполняет `npm run db:migrate:deploy` внутри контейнера `api`).

Альтернатива без скрипта: одноразовый контейнер `node` с примонтированным каталогом `prisma`, когда сервис `db` в состоянии healthy, из каталога с репозиторием на сервере.

Задайте **фиксированное имя проекта Compose**, чтобы имя сети по умолчанию было предсказуемым (`${COMPOSE_PROJECT_NAME}_default`):

```bash
cd /opt/dayday_erp
export COMPOSE_PROJECT_NAME=dayday_prod
set -a && source .env && set +a

docker compose -f docker-compose.prod.yml up -d db
# Когда в `docker compose ps` у db статус healthy:

docker run --rm \
  --network "${COMPOSE_PROJECT_NAME}_default" \
  -e DATABASE_URL="postgresql://${POSTGRES_USER:-dayday}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-dayday}" \
  -v "$(pwd)/packages/database/prisma:/prisma" \
  -w /prisma \
  node:20-alpine \
  sh -c "npx --yes prisma@6.19.3 migrate deploy"
```

Подстройте `POSTGRES_*`, если меняли их в `.env`. Альтернатива: с доверенной машины выполнить `npm run db:migrate:deploy`, указав `DATABASE_URL`, который достигает Postgres (VPN или SSH-туннель).

## 7. Справочные данные БД → SQL-дамп (обязательный сценарий со скриптом)

Postgres выполняет скрипты из `packages/database/prisma/docker-init/` **только при первом создании** каталога данных. Если том Docker с БД уже существует, **новый `01-seed-data.sql` из Git сам по себе не накатится** — в работающей базе не появятся обновлённые переводы, `system_config`, прайс и т.п.

**Правило при релизе:** как только вы меняете в «эталонной» базе платформенные данные (переопределения i18n, биллинг/прайс, квоты, настройки в `system_config` и т.д.), нужно **выгрузить** это состояние в репозиторий скриптом и **закоммитить** обновлённый `01-seed-data.sql`, чтобы свежие установки и ручное применение на сервере оставались согласованными.

Из **корня монорепо**, при корневом `.env` с рабочим `DATABASE_URL` на БД с нужным содержимым:

```bash
npm run db:dump-to-prod
```

Скрипт перезаписывает `packages/database/prisma/docker-init/01-seed-data.sql` идемпотентными `INSERT … ON CONFLICT` для:

- `translation_overrides` (с отсечением опасных односегментных ключей),
- `system_config`,
- `pricing_modules`, `pricing`, `pricing_bundles`.

Сид супер-админа лежит отдельно в **`02-super-admin-seed.sql`** (экспорт его не перезаписывает; пароль в дампе пользователей по умолчанию не тянется из БД).

**Другие варианты вызова:** `dotenv -e .env -- npm run docker-init:export -w @dayday/database` (тот же экспорт). Чтобы вывести SQL в stdout вместо файла: задайте `DOCKER_INIT_OUT=-` перед командой.

**Уже работающий прод-сервер:** после `git pull` при необходимости прогоните новый дамп (или нужные фрагменты) через `psql` в контейнере `db`, если том с данными уже был создан — иначе строки в БД не обновятся.

## 8. Сборка и запуск всего стека

### Скрипты в `scripts/` (сервер, из корня репозитория)

| Скрипт | Когда использовать |
|--------|--------------------|
| `bash scripts/deploy-prod-code.sh` | Обновление кода/образов **без** миграций Prisma (схема БД не менялась). |
| `bash scripts/deploy-prod-db-migrate.sh` | Релиз с **новыми миграциями**: `git pull`, бэкап БД, `up --build`, затем `prisma migrate deploy` внутри контейнера `api`. |
| `bash scripts/deploy-prod-db-reset.sh` | **Только осознанно:** снимок тома Postgres (`down -v`), полный `db:prod-init` — все данные БД в compose-томе уничтожаются. |

Перед первым запуском скриптов: `chmod +x scripts/*.sh` (по желанию). Убедитесь, что в `.env` заданы `REDIS_URL`, `POSTGRES_PASSWORD`, JWT и при необходимости `COMPOSE_PROJECT_NAME`.

### Вручную через Compose

Из корня репозитория (где лежит `docker-compose.prod.yml`). Имя проекта Compose должно совпадать с тем, что использовали для миграций (часто задаётся в `.env` как `COMPOSE_PROJECT_NAME`):

```bash
export COMPOSE_PROJECT_NAME=dayday_prod   # или уже в .env
docker compose -f docker-compose.prod.yml up -d --build
```

Проверка состояния:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api web
```

## 9. HTTPS и обратный прокси (рекомендуется)

Для публичного доступа завершайте TLS на **nginx** или **Caddy** перед портами `web` (и при необходимости `api`). Ограничьте или уберите проброс портов Postgres/Redis (`POSTGRES_PUBLISH_PORT` / `REDIS_PUBLISH_PORT`), если к ним снаружи подключаться не нужно.

## 10. Устранение неполадок

- **Подстановка переменных в Compose:** спецсимволы в `POSTGRES_PASSWORD` могут сломать собранную из кусков строку `DATABASE_URL`. Используйте пароль, безопасный для URL, или процент-кодируйте символы в строке подключения для миграций.
- **`npm ci` в Docker:** сборка опирается на закоммиченный `package-lock.json` в корне монорепо. Если установка в образе падает, пересоберите lockfile локально и закоммитьте.
