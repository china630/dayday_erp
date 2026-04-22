# Техническое задание (Т/З): DayDay ERP

Единый документ для разработки: объединяет ядро Core MVP, расширения v2, интеграции v3 и слой монетизации v4. Сводные продуктовые решения — **[PRD.md](./PRD.md)** (§12 и др.). Детализация REST — **§0.0** ниже и Swagger API.

**Оглавление (верхний уровень):** **§0.0** — реестр ключевых REST; §0 — статус синхронизации; §1 — инфраструктура; §2–§10 — модули **1–9**; **§6.0** — Treasury + касса/банк; **§7.0** — HR, табель, payroll, ЦФО; §11 — паттерн разработки; §12–§14 — дорожные карты; §15 — Super-Admin; §16–§17 — hardening.

---

### 0.0. Реестр ключевых эндпоинтов (выжимка)

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/api/admin/chart-template` | Глобальный каталог NAS (`ChartOfAccountsEntry`), чтение (super-admin) |
| POST | `/api/admin/chart-template` | Upsert строки каталога NAS (super-admin) |
| POST | `/api/billing/webhooks/:provider` | Webhook платёжного провайдера (`mock`, `pasha`, `pasha_bank`), публичный маршрут |
| GET | `/api/reports/cash-flow` | ДДС прямой метод (`CashFlowService.getDirectCashFlow`), query: `dateFrom`, `dateTo`, опц. `cashDeskId`, `bankName` |
| GET | `/api/hr/payroll/jobs/:jobId` | Статус фоновой задачи расчёта ЗП (BullMQ) |

Полный перечень — OpenAPI `/api`. См. также `/api/treasury/*`, `POST /api/banking/manual-entry`, `GET /api/holdings/:id/consolidated-pnl`, `GET /api/reporting/pl?departmentId=…`.

---

## 0. Синхронизация с PRD

Таблица **§0.0** отражает актуальные контракты **v25.0**. Расширенное описание модулей — разделы **§2–§10**, **§6.0**, **§7.0**; продуктовые формулировки — **PRD §4.12**, **§4.13**, **§5.1**.

---

## 1. Инфраструктура и стек (MVP)

| Компонент | Решение |
|-----------|---------|
| **Хостинг** | Один VPS; оркестрация — **Docker Compose** |
| **БД** | PostgreSQL + расширение `uuid-ossp` |
| **Кэш / очереди** | **Redis** + **BullMQ**: расчёт ЗП, импорт выписок, прочие долгие задачи — **вне** HTTP-запроса API |
| **Файлы (PDF, логотипы)** | **`STORAGE_SERVICE`**: в **production** ожидается **`STORAGE_DRIVER=s3`** и переменные **`S3_*`**; локально — **`STORAGE_DRIVER=local`** + `STORAGE_LOCAL_ROOT` (см. PRD §11.0) |
| **Почта** | **Nodemailer (SMTP)** — счета, сброс пароля |
| **Monorepo** | `apps/web` (Next.js), `apps/api` (NestJS), `packages/database` (Prisma и общие типы при необходимости) |
| **Локаль** | БД: **UTC**; UI: **i18next**; язык по умолчанию **RU**, подготовка полных строк под **AZ**; форматирование дат и **AZN** — локаль Азербайджана |
| **Локальная инфра (Windows)** | Тома Docker, загрузки API, **npm-кэш**, **TEMP/TMP** — только **D:** (`D:\DockerData\dayday_erp`); корневой `.npmrc`. Образы Docker — **Disk image location** на D в Docker Desktop |

**Production HTTPS requirement (hardening):**

- Production environment **must use HTTPS** for the web origin.
- Rationale: parts of the frontend rely on **WebCrypto** capabilities that may be restricted in insecure contexts (plain HTTP), and browsers can degrade/disable APIs and increase fetch instability under mixed/insecure conditions.
- Development exception: `http://localhost` is allowed.

### 1.1. Архитектура холдинга: консолидация валют (Reporting Aggregator)

**Maintenance mode (admin runbook) — before Prisma deploy migrations (PRD §10.0 / TZ §1):**

Цель: перед `prisma migrate deploy` временно отключить UI (и при необходимости API) понятной заглушкой, чтобы пользователи не работали в полусостоянии во время деплоя.

- **Caddy / app-level (рекомендуется для типового Compose-деплоя)**
  - В `.env`: `MAINTENANCE_MODE=1`
  - Применить: `docker compose -f docker-compose.prod.yml up -d web`
  - Выключить: убрать/обнулить `MAINTENANCE_MODE`, затем снова `up -d web`.

- **Nginx (UI boundary, альтернативный вариант)**
  - Положить страницу: `docs/maintenance.html` → `/var/www/html/maintenance.html`
  - Подключить сниппет: `docs/nginx-maintenance.conf` (возвращает **503** если существует `/var/www/html/maintenance.enable`)
  - Включить режим обслуживания:

    ```bash
    sudo touch /var/www/html/maintenance.enable
    sudo nginx -t && sudo systemctl reload nginx
    ```

  - Выключить режим обслуживания:

    ```bash
    sudo rm -f /var/www/html/maintenance.enable
    sudo nginx -t && sudo systemctl reload nginx
    ```

- **Deploy flow (recommended)**
  - Enable maintenance (см. выше)
  - Apply DB migrations:

    ```bash
    docker compose -f docker-compose.prod.yml exec api npm run db:migrate:deploy
    ```

  - Optional platform init:

    ```bash
    docker compose -f docker-compose.prod.yml exec api npm run db:prod-init
    ```

  - Disable maintenance

**Сводный P&L по холдингу за период** (`HoldingsReportingService.consolidatedProfitAndLoss`): реализовано **помесячной нарезкой периода** (UTC, `accrualMonthSlices` в `reporting-period.util.ts`). Для каждого фрагмента вызывается `ReportingService.profitAndLoss(org, from, to)`, затем **`CurrencyConverterService.convert(netProfit, orgCurrency, holdingBase, fxAsOf)`** с **`fxAsOf` = последний день фрагмента**. Результаты по фрагментам **суммируются**. Это и есть продуктовый стандарт **Monthly Slices** (PRD §1.1).


**`CurrencyConverterService.convert`** — точечная конвертация на дату `asOf` (кросс через AZN); для «историчности» по длинному периоду используется **внешний** цикл по фрагментам (см. выше), а не один вызов на `dateTo`.

**Дашборд cash/bank** по холдингу (`getHoldingSummary`): конвертация остатков на **одну** дату `asOf` — отдельно от политики P&L.

**Источник курсов:** `cbar_official_rates`, `CbarFxService`.

---

## 2. Модуль 1: Identity & Access Management (IAM) & Multi-tenancy

### Цель

Создать безопасную среду, где данные разных компаний никогда не пересекаются.

### Модель тенанта

- **1 tenant = 1 юрлицо (один VÖEN).** Пользователь с несколькими компаниями состоит в нескольких организациях (связь **many-to-many** через membership).
- В сущности **Organization** сразу завести поле **`subscriptionPlan`**; лимиты тарифов в MVP **не хардкодить** (детализация подписок — §14).

### 2.1. Рефакторинг на Many-to-Many (схема и auth)

**Prisma**

- **User:** без `organizationId` на уровне пользователя; профиль: `fullName`, `avatarUrl` (и т.п.).
- **OrganizationMembership:** связь `{ userId, organizationId, role, joinedAt }`, составной PK `(userId, organizationId)`.
- **AccessRequest:** запрос на вступление в существующую организацию по VÖEN (статусы ожидания / принят / отклонён).
- **OrganizationInvite:** приглашение по email в организацию (в т.ч. для пользователя, который ещё не зарегистрирован — доставка письмом; если пользователь уже есть — видит приглашение в кабинете).

**Бизнес-логика и API**

1. **`POST /api/auth/login`** — в ответе **accessToken** (контекст первой/выбранной организации в JWT) и **список доступных организаций** (`organizations`).
2. **`POST /api/auth/switch`** — тело `{ organizationId }`; выдаётся новая пара токенов, в access JWT «вшит» выбранный `organizationId` при валидном membership.
3. **Guards:** из JWT читаются `organizationId` и роль; перед обработкой запроса проверяется наличие строки в **OrganizationMembership**.
4. **Join по VÖEN:** если организация найдена, создаётся **AccessRequest**; владелец/админ одобряет или отклоняет, при одобрении назначается роль.
5. **Invite:** `inviteUser(email, role)` создаёт запись приглашения; при существующем пользователе с тем же email — приглашение отображается в UI; иначе — письмо (SMTP).

### Система ролей (RBAC)

| Роль | Права |
|------|--------|
| **Owner** | Полный доступ, управление подпиской |
| **Admin** | Управление пользователями и настройками |
| **Accountant** | Доступ к финансам и отчётам |
| **User** | Ограниченный доступ (только свои документы) |

### Безопасность

- **Middleware (NestJS):** инъекция `organizationId` из JWT в каждый запрос.
- **Глобальный фильтр в Prisma:** все запросы `findMany`, `findUnique` должны включать `where: { organizationId }`.
- **Auth:** Access Token (JWT); Refresh Token — в **HttpOnly Cookie**.

### Validation Strict Mode (v5.8) — синхронно с §17

- Глобальный `ValidationPipe` в `main.ts`: `whitelist: true`, **`forbidNonWhitelisted: true`**, `transform: true` (см. **§17** — та же формулировка для RC). Поля тела запроса, не описанные в DTO (`class-validator`), приводят к ответу **400 Bad Request** (а не молчаливому отбрасыванию).

### Policy Guard (v5.8, CASL-like)

- Для детализации ролей **Accountant** и **User** в финансовых документах используются явные проверки политик (например модуль `auth/policies`): мутации инвойсов в статусе **PAID** и ручные проводки журнала недоступны роли **User**, где это зафиксировано в [PRD.md](./PRD.md) §7.9; критичные эндпоинты дополнительно защищаются **RolesGuard** / `@Roles(...)`.

### Сырой SQL и изоляция тенанта

- При использовании **`$queryRaw`** / **`$executeRaw`** в запросах к данным организации вручную добавлять условие по **`organizationId`** (или параметризованный эквивалент), чтобы исключить пересечение тенантов.
- **Реализация (v23.0):** в API доступен **`TenantPrismaRawService`** (`$queryRaw` / `$executeRaw` / `*Tx`) — **обязательный аргумент `organizationId`** на уровне вызова; SQL собирается через `Prisma.sql` и должен связывать этот идентификатор. DDL и платформенный SQL без тенанта — только через **`executePlatformRawUnsafe`** в пакете `@dayday/database` (скрипты вроде `prod-init.ts`), не через tenant-обёртку.

**Неизменяемый журнал аудита (продуктовый модуль 8)** — требования к `AuditMutationInterceptor`, полям `AuditLog` и архиву: **§9**.

---

## 3. Модуль 2: Ledger & Finance Core

### Цель

Обеспечить математическую точность учёта (финансовый движок double-entry).

### План счетов (Chart of Accounts / Accounts)

- Иерархическая структура — дерево счетов (self-relation в БД).
- Типы: Asset, Liability, Equity, Revenue, Expense.
- **Seeding:** единый план счетов бухучёта АР; данные подгружаются из **JSON** в репозитории (коды 101, 201, 521 и т.д.) при регистрации организации.

### Транзакции (Transaction) и проводки (Journal Entry)

| Требование | Описание |
|------------|----------|
| **Валидация** | Функция `validateBalance()` проверяет, что **Σ Debit = Σ Credit** перед сохранением |
| **Атомарность** | `Prisma.$transaction`: при ошибке одной проводки откатывается вся транзакция |
| **Блокировка** | Невозможность удаления/изменения проводок в «закрытых» периодах; закрытие периода — только **Owner** или **Admin** |
| **Журнал (MVP)** | Правки проводок **допускаются**, каждое изменение — в **`AuditLog`**; неизменяемый журнал / только сторно — позже |

### 3.1. Дополнение: взаимозачёт (Netting)

Оформление **взаимозачёта** (схлопывание встречных требований) по одному контрагенту: уменьшение **кредиторки 531** и **дебиторки 211** одной проводкой.

#### Сервис `FinanceService` (фасад)

| Метод | Назначение |
|--------|------------|
| `getNettingCandidate(counterpartyId)` | Возвращает оценки **дебиторки** (как в отчёте по неоплаченным инвойсам с выручкой), **кредиторки 531** (обороты по счёту 531 с `transaction.counterpartyId`), **suggestedAmount = min(оба)**, флаг **`canNet`** (истина, если min > 0). Книга: query `ledgerType` (**NAS** / **IFRS**) для счёта 531. |
| `executeNetting(counterpartyId, amount)` | Валидация `amount ≤ min(...)`; в **одной БД-транзакции**: проводки **Дт 531 — Кт 211** на `amount` (`counterpartyId` на транзакции); затем **распределение** суммы по неоплаченным инвойсам контрагента (FIFO по `dueDate`, строки `InvoicePayment` с `transactionId` = транзакция зачёта, **без** второй пары проводок). Обновление статусов инвойсов (PAID / PARTIALLY_PAID и т.д.). |

**REST (реализация):** `GET /api/reporting/netting/preview`, `POST /api/reporting/netting` (см. Swagger).

#### Согласованность отчётов

После зачёта **дебиторка** (`accountsReceivable`) и **старение** остаются согласованными с ГК по 211, т.к. уменьшение долга по инвойсу отражено записями оплат, привязанными к той же финансовой транзакции, что и Кт 211.

#### UI (модуль 7 / отчёты)

- **Акт сверки** (`/reporting/reconciliation`): блок **«Встречные требования»** (остатки 211 / 531 и лимит зачёта); кнопка формирования взаимозачёта **доступна только при `canNet`**.
- **Карточка инвойса:** при непогашенном остатке и `canNet` — действие **«Оплатить зачётом»** (сумма по умолчанию ≤ min(остаток инвойса, suggestedAmount)).

---

## 4. Модуль 3: CRM & Counterparties

### Цель

Централизованное управление базой клиентов и поставщиков.

### Карточка контрагента

- **Тип:** физическое лицо / юридическое лицо; в учёте взаимодействий — **Клиент / Поставщик**.
- **Обязательные поля:** Name, VÖEN (10 цифр), Address, Bank Accounts.

### Взаиморасчёты

- Счёт **211** (дебиторская задолженность) — для клиентов.
- Счёт **531** (кредиторская задолженность) — для поставщиков.
- Автоматическое обновление баланса контрагента при каждой финансовой проводке.

---

## 5. Модуль 4: Sales & Invoicing

### Цель

Автоматизация выставления документов и признания выручки.

### UI (реализация vX.Y): создание через модальные окна

- Создание **инвойса** выполняется через модальное окно **CreateInvoiceModal** на странице `/invoices` (без отдельной страницы создания).
- Создание **контрагента** выполняется через модальное окно **CreateCounterpartyModal** на странице `/counterparties` (без отдельной страницы создания).
- Legacy-маршруты:
  - `/invoices/new` → редирект на `/invoices` (создание через модалку).
  - `/counterparties/new` → редирект на `/counterparties` (создание через модалку).

### Контрагенты (VÖEN / MDM lookup) — UI/REST

- Валидация: VÖEN (`taxId`) — **строго 10 цифр**.
- Автозаполнение (MDM): при вводе 10 цифр UI вызывает `GET /api/counterparties/global/by-voen/:taxId` и автозаполняет **имя** и **статус НДС**.
- Ручная проверка: кнопка «Yoxla» повторно запускает lookup; если MDM не вернул запись, допускается fallback-проверка через `GET /api/tax/taxpayer-info?voen=...`.

### Invoice

- Генерация уникального номера по маске (например, `INV-2026-001`).
- Расчёт НДС (ƏDV / EDV) на MVP: **только** 0%, 18% и «освобождён».
- Каталог товаров и услуг; акты приёмки-передачи (**Handover Acts**).
- Статусы оплаты: Draft, Sent, Paid, Overdue, Cancelled.

### НДС и услуги (UI)

- `vatInclusive`: чекбокс «Qiymətlər ƏDV daxil (brüt)» — если включён, `unitPrice` в UI трактуется как **брутто**, backend рассчитывает нетто.
- `vatRate`: ставка **0%** или **18%**.
- Услуги: флаг **isService** в UI — скрывает складские предупреждения и в PDF отображает строку как «Xidmət».

### Бизнес-логика (триггеры)

**При смене статуса инвойса на Paid:**

1. Создать `Transaction`.
2. Проводка: **Дт 101/221** (Касса/Банк) — **Кт 211** (дебиторка).

### Печатные формы

- Генерация PDF на **AZ / RU / EN**.

---

## 6. Модуль 5: Cash Management

### Цель

Контроль за движением реальных денег.

### 6.0. Treasury, касса (`/api/banking/cash`), банк (`/api/banking`) — REST, DTO, проведение, миграция БД

*В нумерации продукта это **модуль 5 (Cash)**; в данном Т/З он оформлен как **§6**. Технический блок «5.0» из обсуждения = этот подраздел **§6.0**.*

**Общие правила HTTP**

- Глобальный префикс Nest: **`/api`** (итоговые пути: `/api/treasury/...`, `/api/banking/...`).
- Аутентификация: **Bearer JWT**; контекст организации — из токена (декоратор `@OrganizationId()`).
- **Treasury** — отдельный контроллер **без** `SubscriptionGuard` (доступ при валидном членстве в организации); мутации защищены **`RolesGuard`**.
- **Банк** — контроллер `banking` с **`SubscriptionGuard`** и **`@RequiresModule(BANKING_PRO)`** (см. `ModuleEntitlement`).
- **Касса** — контроллер `banking/cash` с **`SubscriptionGuard`** и **`@RequiresModule(KASSA_PRO)`**.

**Терминология (азербайджанский бухучёт, стандарты АР) — UI и печать**
- Для пользователя (веб-i18n, заголовок вкладки браузера, **H1** печатной формы кассового ордера) основной текст — **официальные** формулировки, а не «cash order report»:
  - **Приход в кассу** (income, поступление наличных): **Kassa Mədaxil Orderi**, аббревиатура **KMO** (приход — *mədaxil*, касса — *kassa*).
  - **Расход из кассы** (expense, выдача наличных): **Kassa Məxaric Orderi**, **KXO** (расход — *məxaric*).
- **Legacy / backwards compatibility:** в существующих данных и части кода/маршрутов может встречаться старое именование **MKO/MXO**. В рамках миграции UX и API применяется переименование **MKO → KMO**, **MXO → KXO** (без изменения бизнес-смысла); legacy-алиасы допускаются на переходный период.
- См. также `apps/web/lib/i18n/resources.ts` (`banking.cash.*`) и печать ордера (web print + server HTML, в зависимости от реализации) в `apps/api/src/kassa/cash-order.service.ts`.

---

#### Шаг 1. Справочник статей ДДС (`CashFlowItem`)

| Метод и путь | Роли | Тело / ответ |
|--------------|------|----------------|
| `GET /api/treasury/cash-flow-items` | JWT (роли не навешаны на метод) | Массив записей `{ id, organizationId, code, name, createdAt, updatedAt }`. Если у организации **0** строк — в той же логике запроса выполняется **транзакция** с созданием типового набора из **5** кодов: `CF-OPS`, `CF-SUP`, `CF-SAL`, `CF-TAX`, `CF-OTH` (названия по умолчанию на AZ), затем возвращается полный список. |
| `POST /api/treasury/cash-flow-items` | **Owner, Admin, Accountant** | **DTO `CreateCashFlowItemDto`:** `code` — string, 1…64; `name` — string, 1…255. Ответ: созданная сущность. Ошибка **400**, если `code`/`name` после `trim` пустые. Уникальность **`(organizationId, code)`** на уровне БД (`@@unique`). |

---

#### Шаг 2. Справочник физических касс (`CashDesk`)

| Метод и путь | Роли | Тело / ответ |
|--------------|------|----------------|
| `GET /api/treasury/cash-desks` | JWT | Список **`isActive: true`**, сортировка по `name`. **Include:** `employee { id, firstName, lastName, finCode }` при наличии `employeeId`. |
| `POST /api/treasury/cash-desks` | **Owner, Admin, Accountant** | **DTO `CreateCashDeskDto`:** `name` — string, 1…255 (обязательно); `employeeId` — optional UUID; `currencies` — optional `string[]` (ISO коды; если не передан или пустой — сохраняется **`[]`**). Ответ: созданная касса с тем же `include` по сотруднику. **400**, если `name` пустой после `trim`. |

**Сервисные проверки (используются кассой/банком):**

- `assertCashFlowItem(organizationId, id)` — строка существует в организации; иначе **400** `cashFlowItemId not found for organization`.
- `assertCashDesk(organizationId, id)` — строка существует, **`isActive: true`**; иначе **400** `cashDeskId not found for organization`.

---

#### Шаг 3. Кассовые ордера (`CashDeskController`, базовый путь `/api/banking/cash`; в БД/Prisma — `KMO` / `KXO`; legacy: `MKO` / `MXO`)

| Метод и путь | Роли | Назначение |
|--------------|------|------------|
| `GET /api/banking/cash/balances` | JWT | Остатки по счетам **101\*** по валютам; query `ledgerType` — как в остальных отчётах (`parseLedgerTypeQuery`). |
| `GET /api/banking/cash/orders` | JWT | Журнал ордеров организации. |
| `POST /api/banking/cash/orders/kmo` | **Owner, Admin, Accountant** | Черновик **KMO**; тело **`CreatePkoDraftDto`**. |
| `POST /api/banking/cash/orders/kxo` | те же | Черновик **KXO**; тело **`CreateRkoDraftDto`**. |
| `POST /api/banking/cash/orders/:id/post` | те же | **Проведение** черновика → проводка в ГК + статус **POSTED**. |
| `GET /api/banking/cash/orders/:id/print` | JWT | HTML бланк для печати. |
| `GET /api/banking/cash/accountable` | JWT | Подотчётные (сальдо **244**). |
| `POST /api/banking/cash/advance-reports` / `…/:id/post` | **Owner, Admin, Accountant** | Авансовый отчёт (без изменений в рамках §6.0). |

**KO-1 print form (форма № KO-1)**

- For **KMO** (incoming cash order), UI provides an additional print view **KO-1** with a strict grid layout (per the accountant audit template).
- The print view includes the field **“Məbləğ yazı ilə”** rendered in **AZ** and **RU** (amount-to-words).
- UI entry point: button **“Çap et”** in the cash order view modal (web print).

**DTO черновика MKO — `CreatePkoDraftDto`**

| Поле | Тип / ограничения | Обяз. |
|------|-------------------|--------|
| `date` | `YYYY-MM-DD` (`@IsDateString`) | да |
| `pkoSubtype` | enum **Prisma** `CashOrderPkoSubtype`: `INCOME_FROM_CUSTOMER`, `RETURN_FROM_ACCOUNTABLE`, `WITHDRAWAL_FROM_BANK`, `OTHER` | да |
| `amount` | number, `@Type(() => Number)`, finite, max 4 знака после запятой, **≥ 0.01** | да |
| `currency` | string, optional (по умолчанию при сохранении **`AZN`**) | нет |
| `purpose` | string | да |
| `cashAccountCode` | string, optional — иначе подстановка **101\*** по валюте (`resolveCashAccountCodeForCurrency`) | нет |
| `offsetAccountCode` | string, optional — **обязателен** для подтипов `OTHER`, `RETURN_FROM_ACCOUNTABLE`; для остальных может выводиться автоматически (601, 221 и т.д. по логике `resolvePkoOffset`) | нет |
| `counterpartyId`, `employeeId` | UUID, optional | нет |
| `notes` | string, optional | нет |
| **`cashFlowItemId`** | UUID | **да** (валидация `@IsUUID`); при создании черновика проверяется через `assertCashFlowItem`. |
| **`cashDeskId`** | UUID, optional; если задан — `assertCashDesk`. | нет |

**DTO черновика MXO — `CreateRkoDraftDto`**

Те же базовые поля, что у MKO по смыслу: `date`, `rkoSubtype` (**`CashOrderRkoSubtype`**: `SALARY`, `SUPPLIER_PAYMENT`, `ACCOUNTABLE_ISSUE`, `BANK_DEPOSIT`, `OTHER`), `amount`, `currency`, `purpose`, `cashAccountCode`, `offsetAccountCode`, `counterpartyId`, `employeeId`, `notes`, **`cashFlowItemId`** (обяз.), **`cashDeskId`** (optional).

Дополнительно:

| Поле | Описание |
|------|-----------|
| **`withholdingTaxAmount`** | optional number, ≥ 0, finite, до 4 знаков; если > 0 — сохраняется в ордере. **Только для MXO** (см. проведение). |

**Проведение `POST …/orders/:id/post` (`CashOrderService.postOrder`)**

1. Ордер существует в организации, статус **`DRAFT`**; иначе **404** / **409**.
2. Если **`skipJournalPosting`** — только смена статуса на **POSTED**, привязка `postedTransactionId` к уже существующей `linkedTransactionId` (без новой проводки).
3. Иначе: обязателен **`cashFlowItemId`** на записи; повторная проверка `assertCashFlowItem`; при **`cashDeskId`** — `assertCashDesk`.
4. Обязателен непустой **`offsetAccountCode`**; **`cashAccountCode`** должен проходить **`assertValidCashDeskAccountCode`** (касса **101\***).
5. **Удержание налога у источника:** если `withholdingTaxAmount` > 0 — только для **`MXO`**; сумма **`amount`** трактуется как **нетто** (выдано из кассы), **валовая** = `amount + withholdingTaxAmount`. Проводки в одной транзакции: **Дт** второй счёт (`offset`) на **gross**, **Кт** касса на **amount**, **Кт** счёт **`521`** (`PAYROLL_TAX_PAYABLE_ACCOUNT_CODE`) на **withholdingTaxAmount**. Если удержание 0 — классическая пара Дт/Кт по кассе и второму счёту на сумму `amount`.
6. MKO: **Дт** касса, **Кт** второй счёт на `amount`.
7. После успеха — `postedTransactionId` на созданную финансовую транзакцию, статус **POSTED**.

*Черновики, созданные до появления поля ДДС в UI, могут не иметь `cashFlowItemId` в БД — такие ордера **не проведутся**, пока не будут пересозданы или не выполнен backfill.*

#### §6.0.1. Validation Logic: закрытые периоды и «заднее число» (`CashOrderService`)

**Закрытые периоды:** проведение ордера вызывает `AccountingService.postJournalInTransaction`, где уже проверяется вхождение `monthKeyUtc(order.date)` в `settings.reporting.closedPeriods` — **дополнительно** UI не должен предлагать проведение в закрытом месяце (синхронизация с PRD §4.5.2).

**Backdating (расход из кассы, `MXO`):** если `order.date` **раньше** текущей календарной даты (UTC) и вид операции **уменьшает** остаток на счёте кассы **101\***, перед проведением выполняется проверка «кассового разрыва»:

Для каждого календарного дня \(t\) от `order.date` до **сегодня** (включитель, UTC) вычисляется нетто **Дт − Кт** по счёту кассы на конец дня \(t\) **без** новой проводки; затем из нетто вычитается сумма расхода \(A\). Если для **любого** \(t\) результат \(< 0\) — выброс **`ForbiddenException`** с текстом:

> Операция невозможна: возникнет кассовый разрыв на \[Date\]

где `[Date]` — **YYYY-MM-DD** в UTC. Ограничение глубины backdating (например, не более **400** дней) допускается для защиты API от злоупотреблений.

**MKO** (приход в кассу): отдельная проверка «разрыва» не требуется (остаток не уменьшается).

---

#### Шаг 4. Ручная банковская операция (`POST /api/banking/manual-entry`)

- Модуль: **`BANKING_PRO`**; роли: **Owner, Admin, Accountant**.
- **DTO `ManualBankEntryDto`:**

| Поле | Описание |
|------|-----------|
| `type` | enum **`BankStatementLineType`**: `INFLOW` \| `OUTFLOW` |
| `amount` | > 0, finite, до 4 десятичных |
| `bankAccountCode` | строка; после trim должна удовлетворять **`isBankLedgerAccountCode`** — счета **221\*, 222\*, 223\*, 224\*** |
| `offsetAccountCode` | второй счёт проводки (строка, не пустая) |
| `date` | `YYYY-MM-DD` |
| **`cashFlowItemId`** | UUID; проверка `treasury.assertCashFlowItem` |
| `description` | optional; в проводке/выписке по умолчанию текст **`Manual bank entry`** |

**Поведение сервиса (`BankingService.manualBankEntry`)** — одна **`Prisma.$transaction`**:

1. Формирование пар проводок: при **INFLOW** — **Дт** банк, **Кт** offset; при **OUTFLOW** — **Дт** offset, **Кт** банк.
2. `accounting.postJournalInTransaction` с `reference: "BANK-MANUAL"`, `isFinal: true`.
3. Создание **`BankStatement`** с `bankName: "MANUAL_BANK"`, `channel: BANK`, `date`, `totalAmount = amount`.
4. Создание **`BankStatementLine`** с `origin: MANUAL_BANK_ENTRY`, `type` из DTO, `valueDate`, `isMatched: true`, **`cashFlowItemId`** из DTO.

Ответ: `{ ok: true, bankStatementId }`.

**Разделение потоков Bank vs Cash (реестры операций):**

- Эндпоинт реестра: `GET /api/banking/lines`.
- Для страницы **Bank** (`/banking`) UI обязан запрашивать только банковские операции:  
  `GET /api/banking/lines?channel=BANK&bankOnly=true`
- При `bankOnly=true` сервер выполняет **жёсткий фильтр** по `origin`, исключая кассовые и системные источники, и возвращает **только**:
  - `MANUAL_BANK_ENTRY`
  - `FILE_IMPORT`
  - `DIRECT_SYNC`

---

#### Шаг 5. Схема миграции БД (эквивалент применённых изменений Prisma)

В репозитории миграции могут храниться вне рабочей копии; ниже — **логический порядок** изменений схемы, согласованный с `packages/database/prisma/schema.prisma` и кодом API.

1. **Таблица `cash_flow_items`**  
   - Колонки: `id` UUID PK, `organization_id` UUID FK → `organizations` ON DELETE CASCADE, `code` text, `name` text, `created_at`, `updated_at`.  
   - **UNIQUE** `(organization_id, code)`. Индекс по `organization_id`.

2. **Таблица `cash_desks`**  
   - `id` UUID PK, `organization_id` FK CASCADE, `name`, `employee_id` UUID NULL FK → `employees` ON DELETE SET NULL, `currencies` массив text (Postgres `text[]`), `is_active` boolean default true, timestamps.  
   - Индексы: `organization_id`, `employee_id`.

3. **Таблица `cash_orders`** — новые/изменённые поля  
   - `cash_flow_item_id` UUID NULL FK → `cash_flow_items` ON DELETE SET NULL, индекс.  
   - `cash_desk_id` UUID NULL FK → `cash_desks` ON DELETE SET NULL, индекс.  
   - `withholding_tax_amount` `NUMERIC(19,4)` NULL — удержание на РКО.

4. **Enum `BankStatementLineOrigin`** (Postgres `ENUM` или текст + маппинг — как сгенерировал Prisma)  
   - Значение **`MANUAL_BANK_ENTRY`** (ручная банковская операция). Остальные значения enum: `FILE_IMPORT`, `DIRECT_SYNC`, `WEBHOOK`, `INVOICE_PAYMENT_SYSTEM`, `MANUAL_CASH_OUT`.

5. **Таблица `bank_statement_lines`**  
   - Колонка **`origin`** с default **`FILE_IMPORT`**.  
   - Колонка **`cash_flow_item_id`** UUID NULL FK → `cash_flow_items` ON DELETE SET NULL, индекс.

6. **Связи в `Organization`** (Prisma): коллекции `cashFlowItems`, `cashDesks`; у **`CashFlowItem`** / **`CashDesk`** — обратные связи на `CashOrder` и `BankStatementLine` где задано в схеме.

**Применение в среде:** `npm run db:migrate` из корня монорепо — это **`prisma migrate deploy`** (применить уже добавленные в репозиторий миграции; в CI — то же). Сгенерировать новую миграцию из `schema.prisma`: **`npm run db:migrate:dev`**. Для уже существующих черновиков ордеров без `cash_flow_item_id` — миграция данных или пересоздание документов перед проведением.

---

### Банковские и кассовые счета (не путать с Chart of Accounts)

- Поддержка мультивалютности (AZN, USD, EUR).
- **Курсы:** автозагрузка из **XML/API ЦБА (cbar.az)**; ежедневное обновление **в 00:01** (задача в BullMQ/cron).
- **Переоценка** валютных остатков — **регламентная операция на конец месяца** (не «каждый день пересчитывать остатки» как бизнес-правило по умолчанию).

### Reconciliation (сверка)

- Загрузка выписки: MVP — **CSV / Excel**; импорт тяжёлых файлов — через **очередь**. Прямые API банков (Pasha, ABB и др.) — дорожная карта (см. §13).
- Инструмент **Match (Invoicing match):** сопоставление строки выписки с существующим инвойсом или создание новой транзакции расхода (например, аренда или налоги).

### Подраздел Kassa (касса, v8.2)

Полноценный подмодуль **наличных денежных средств** в разделе казначейства (соответствие требованиям **МФ АР** к первичке и кассовому учёту).

**Интерфейс**

- Отдельная страница **`/banking/cash`**: в **центре** — таблица кассового журнала (ордера MKO/MXO — см. терминологию **§6.0**); **сверху** — действия: **Mədaxil Kassa Orderi (MKO)**, **Məxaric Kassa Orderi (MXO)**, **Avans hesabatı**; **боковая панель** — подотчётные лица (сальдо **244**) и форма авансового отчёта.
- Печать: HTML-бланк ордера для печати на **A4/A5** (чистый шаблон под браузерную печать).

**Функционал**

| Функция | Описание |
|---------|----------|
| **MKO / MXO** | Создание черновиков, проведение с проводкой на счета **101** и корреспондирующие счета (601, 244, 221 и т.д. по типу операции). |
| **Avans hesabatı** | Форма списания долга сотрудника перед кассой (**счёт 244**) через строки расходов по чекам; проведение **Дт 731 / Кт 244** (см. сервис `AdvanceReport`). |
| **Инкассация** | Специальный тип **MXO** (**`BANK_DEPOSIT`**): выдача наличных из кассы в банк (**221** как второй счёт проводки). |
| **Быстрый расход из кассы** | UI «как cashOut»: создаётся **MXO** с типом **OTHER** и счётом расходов **731** (аналог ручного списания без отдельной проводки вне журнала ордеров). |
| **Авто-касса** | Оплата **Nəqd** в продажах/закупках → **черновик** ордера в журнале кассы (связь с оплатой инвойса). |

**Gating (v8.2)**

- API кассы (`/api/banking/cash/*`) требует модуль **`kassa_pro`** (алиас к полномочиям кассы/реестра) или **`banking_pro`** / **`kassa`** в `customConfig.modules`; **ENTERPRISE** — полный доступ.
- Slug **`kassa_pro`** может входить в базовый пресет конструктора; для отдельных клиентов (напр. **TiVi Media**) — выдача **ENTERPRISE** или явный список модулей.

---

## 7. Модуль 6: HR & Payroll (кадры и зарплата АР)

### Цель

Расчёт выплат сотрудникам согласно законодательству АР.

### 7.0. Справочник `AbsenceType` и логика отсутствий (ТК AР; məzuniyyət növləri)

**Источник требований:** практика бухучёта АР (в т.ч. разбор по **muhasib.az** — «Məzuniyyət haqqı hesablanması»), согласование с заказчиком (отпуска/больничные/без оплаты).

#### Схема БД (Prisma)

| Модель / enum | Назначение |
|---------------|------------|
| **`AbsencePayFormula`** | `LABOR_LEAVE_304` — orta aylıq (12 ay) ÷ **30.4** × təqvim günləri; `SICK_LEAVE_STAJ` — ilk **14** gün işəgötürən (staj %), sonrası DSMF (ERP-dən kənar); `UNPAID_RECORD` — yalnız tabellə, ə/h artımı yoxdur. |
| **`AbsenceType`** | `id`, `organizationId`, `code` (unikal `{org, code}`), `nameAz`, `isPaid`, **`description`** (AZ izah), `formula`, `maxCalendarDays` (məs. ödənişsiz üçün **30**), timestamps. |
| **`Absence`** | `employeeId`, **`absenceTypeId`** FK → `AbsenceType`, `startDate`, `endDate`, `note`, `approved`. (Колонка `type` enum удалена; при первом запросе справочника старые коды **LABOR_MAIN** / **LABOR_ADD** / **SOCIAL** / **UNPAID** / **EDU_CREATIVE** / **SICK** автоматически приводятся к каноническим кодам ниже.) |

**Автосид** при первом `GET /api/hr/absence-types` (и миграция кодов для существующих организаций) — **5 типов** по ТК AР / источнику Inara:

| `code` | `nameAz` (кратко) | `isPaid` | `formula` |
|--------|-------------------|----------|-----------|
| **LABOR_LEAVE** | Əmək məzuniyyəti | да | `LABOR_LEAVE_304` |
| **SOCIAL_LEAVE** | Sosial məzuniyyət (hamiləlik, uşağa qulluq) | да | `LABOR_LEAVE_304` |
| **UNPAID_LEAVE** | Ödənişsiz məzuniyyət | нет | `UNPAID_RECORD` (max **30** təqvim günü) |
| **EDUCATIONAL_LEAVE** | Təhsil məzuniyyəti | да | `LABOR_LEAVE_304` |
| **SICK_LEAVE** | Xəstəlik vərəqəsi | да (işəgötürən hissəsi) | `SICK_LEAVE_STAJ` |

#### REST

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/hr/absence-types` | Список типов (роли Owner/Admin/Accountant/**User**); пустой справочник → сид. |
| POST | `/api/hr/absences` | Тело **`CreateAbsenceDto`**: `employeeId`, **`absenceTypeId`**, `startDate`, `endDate`, `note?`. |
| POST | `/api/hr/absences/vacation-pay/calculate` | **`VacationPayCalcDto`**: + optional `absenceTypeId` (должен иметь `LABOR_LEAVE_304`). Ответ: суммы с **2** знаками, `calendarDays` — целое, `divisor304`: `30.4`. |
| POST | `/api/hr/absences/sick-pay/calculate` | **`SickPayCalcDto`**: `employeeId`, `periodStart`, `periodEnd`, `absenceTypeId?` (по умолчанию тип **SICK_LEAVE**). |

#### Табель (`TimesheetService.syncAbsences`)

- `LABOR_LEAVE_304` → ячейка **`VACATION`**.
- `SICK_LEAVE_STAJ` → **`SICK`**.
- `UNPAID_RECORD` → **`OFF`** (не входит в счётчики отпуска/больничного в ведомости).

#### `PayrollService` и черновик ведомости (`createDraftRunSync`)

- Методы **`previewLaborLeavePay`** / **`previewSickLeavePay`** делегируют в **`AbsencesService`** (калькуляторы без проведения ведомости).
- При создании черновика **с привязкой к утверждённому табелю** (`timesheetId`) для штатных (**`EmployeeKind.EMPLOYEE`**) подменяется **базовый gross** до расчёта налогов (`calculatePrivateNonOilPayroll`):
  - **Оплачиваемые отпуска (LABOR_LEAVE_304)** (`VACATION` в табеле): добавляется
    \[
    (\text{SumGross} / (N_{\text{months}} \cdot 30.4)) \times \text{календарные дни отпуска в месяце}
    \]
    где \(N_{\text{months}}\) — количество **полных** отработанных календарных месяцев с даты `hireDate` (в карточке сотрудника) до месяца, предшествующего отпуску, но не более **12**. Если число календарных месяцев с **проведёнными** `payroll_slips` в 12-месячном ретроспективном окне **меньше** \(N_{\text{months}}\) и в карточке сотрудника задано **`initial_salary_balance` > 0**, то к сумме начислений в окне добавляется этот баланс (в т.ч. когда в ERP **нет ни одной** проведённой ведомости в окне — вся база для среднего берётся из `initial_salary_balance`). Если нет ни проводок, ни положительного `initial_salary_balance` — база = **оклад** (`salary`) / 30.4.
  - **Больничный (`SICK_LEAVE_STAJ`)**: к gross месяца добавляется сумма работодателя по правилам ТК AР за **календарные дни больничного в этом месяце**, с учётом **первых 14 календарных дней каждого эпизода** (по записям `Absence` с типом формулы `SICK_LEAVE_STAJ`) и процента от стажа; дни после 14-го оплачиваются DSMF вне ERP.
  - **Без оплаты** (`UNPAID_RECORD` → `OFF` в табеле): отработанные **рабочие** дни (`WORK` + **`BUSINESS_TRIP`** на рабочих днях производственного календаря АР) дают долю оклада \(\text{оклад} \times (\text{дни} / N)\), где \(N\) — число рабочих дней в месяце; дни `OFF` на рабочих днях в эту долю не входят (удержание по табелю).
- Подрядчики (**`CONTRACTOR`**) и ведомость **без табеля** — по-прежнему gross = поле **`salary`** (старое поведение).

### Payroll Processor

Черновик ведомости и проведение при превышении порога **`PAYROLL_ENTITY_ASYNC_THRESHOLD`** (константа в `payroll.constants.ts`; в продакшене **0** — при наличии сотрудников / листов фактически **всегда** через очередь **`payroll-heavy`**, BullMQ) выполняются **асинхронно**: ответ **`{ async: true, jobId }`**, статус — **`GET /api/hr/payroll/jobs/:jobId`**. Уведомления в UI / email — по политике продукта (опционально).

| Направление | Содержание |
|-------------|------------|
| **Вход** | Gross Salary |
| **Выход (удержания)** | См. ниже |

**Удержания и взносы:**

- **Income Tax:** 14% (с учётом льготы 8000 AZN в ненефтяном секторе).
- **DSMF (соцстрах, private non‑oil):** worker: 10% до 200 AZN + 10 AZN с остатка; employer: 22% (standard) или 15% (preferential) — берётся из `Organization.settings`.
- **ITS (медстрах):** progressive (1%–2%) по текущим ставкам АР (см. реализацию tax calculator).
- **Unemployment Insurance:** 0,5%.

### Авто-проводки

При расчёте зарплаты создаются проводки: **Дт 721** (расходы на оплату труда) — **Кт 533** (задолженность перед персоналом).

### 7.0.1. ЦФО (`departmentId`): быстрый расход (QuickExpense) и зарплата

- **`POST /api/accounting/quick-expense`** (`QuickExpenseDto`): поле **`departmentId`** **необязательно** в контракте API. Если передано — выполняется проверка, что `Department` принадлежит организации; значение сохраняется в **`Transaction.departmentId`** и участвует в отчётах с фильтром по ЦФО (например **`GET /api/reporting/pl?departmentId=…`**). Для корректного **P&L по подразделениям** по операционным расходам, вводимым через этот эндпоинт, **`departmentId` следует передавать** всегда, когда расход относится к конкретному ЦФО (иначе проводка попадает только в организационный срез без привязки к отделу).

- **Проведение ведомости ЗП** (`PayrollService.postRunSync`): формируется **одна агрегированная** финансовая транзакция по счетам **721 / 533 / 521** и др. **без** заполнения **`Transaction.departmentId`**. Фонд оплаты труда в главной книге отражается **по организации целиком**; разнесение ФОТ по ЦФО через поле транзакции в текущей реализации **не выполняется**. Для аналитики по персоналу используются **`PayrollSlip`**, **`Employee` → `JobPosition` → `Department`**. Целевое распределение проводок ЗП по `departmentId` — отдельная доработка (до неё P&L по ЦФО по строке «зарплата» опирается на методологию без построчного ЦФО в GL).

### Организационная структура и позиции

Цель — связать кадры с **иерархией подразделений**, **штатным расписанием** и **аналитикой по ЦФО** (см. [PRD.md](./PRD.md) §4.9).

#### Схема данных (Prisma)

| Модель | Поля | Примечания |
|--------|------|------------|
| **Department** | `id`, `name`, `parentId` (self-relation, nullable для корня), `managerId` (FK → `Employee`, nullable при первичном заведении структуры), `organizationId` | Индексы: `organizationId`, `parentId`. Уникальность имён в рамках организации — по политике продукта (по `parentId` + `name` или глобально). |
| **JobPosition** | `id`, `name`, `departmentId` (FK → `Department`), `totalSlots` (Int, ≥ 1), `minSalary`, `maxSalary` (Decimal), `organizationId` | Вилка окладов — для контроля и отчётов; валидация `minSalary ≤ maxSalary`. |
| **Employee** (изменение) | Добавить обязательное поле **`positionId`** (FK → `JobPosition`) | **Миграция:** для существующих строк — либо backfill служебной позицией «Без подразделения» / «Legacy», либо поэтапное заполнение до включения жёсткой валидации на API. |

**Зависимости:** при появлении `Department.managerId` → `Employee` возможна циклическая ссылка (отдел ссылается на сотрудника, сотрудник — на позицию в отделе). На этапе миграции допускается `managerId = null`; заполнение руководителей — после создания карточек сотрудников.

#### Бизнес-логика

**Валидация штата (`EmployeeService.create` / при смене позиции):**

- Пусть `occupied = count(Employee where positionId = X AND organizationId = …)` (при необходимости исключая удалённых / уволенных — по полю статуса, если появится).
- Условие: `occupied < JobPosition.totalSlots`.
- При нарушении: HTTP **402 Payment Required**, тело с кодом **`QUOTA_EXCEEDED`** (см. **§14.8.7**); в NestJS — **`QuotaExceededException`**.

**Иерархия отделов (UI / API):**

- Реализовать **рекурсивный запрос** для дерева подразделений: либо **CTE** в сыром SQL (`WITH RECURSIVE` в PostgreSQL), либо обход в сервисе при ограниченной глубине; ответ API — вложенный JSON (`children[]`) или плоский список с `parentId` + сортировка для построения дерева на клиенте.

#### Аналитика (Reporting)

- **QuickExpense и прочие проводки с `Transaction.departmentId`:** разрезы P&L по ЦФО — по полю транзакции (см. **§7.0.1**).
- **Зарплата:** агрегированная проводка без `departmentId` на транзакции; для срезов по подразделениям — данные **`PayrollSlip`** и оргструктура (**`Employee` → `JobPosition` → `Department`**), до внедрения распределения ФОТ по проводкам.

---

## 8. Модуль 7: Reporting

### Цель

Визуализация состояния бизнеса.

| Отчёт | Описание |
|-------|----------|
| **Trial Balance (ОСВ)** | Сводка остатков на начало, оборотов за период и остатков на конец по всем счетам |
| **P&L** | Доходы минус расходы (**accrual basis** — по отгрузке) |
| **Balance Sheet** | Активы, обязательства, капитал на дату |
| **Cash Flow** | Движение денег (**cash basis** — по факту оплаты) |

На MVP — **внутренняя аналитика**; интеграция с **e-taxes.gov.az** и прочими внешними отчётами — следующий этап (ориентир Q3–Q4).

---

## 9. Модуль 8: Неизменяемый аудит (AuditMutationInterceptor)

### §9.0 Структура таблицы `audit_logs` (Prisma: `AuditLog`)

Логические поля продукта и соответствие колонкам БД:

| Логическое поле | Колонка / Prisma | Описание |
|-----------------|------------------|----------|
| **entityName** (тип сущности) | `entity_type` / `entityType` | Например `Invoice`, `Employee`, `Product`, `JournalEntry`; для прочих мутаций — `HTTP_MUTATION`. |
| **entityId** | `entity_id` / `entityId` | Идентификатор сущности (UUID или строка до 255 символов для fallback). |
| **action** (HTTP-метод мутации) | `action` | `POST`, `PATCH`, `PUT`, `DELETE` (в UI OWNER-журнала маппится на CREATE / UPDATE / DELETE). |
| **userId** | `user_id` / `userId` | Пользователь из JWT (nullable для edge cases). |
| **oldData** | `old_values` / `oldValues` | JSON снимок до изменения (ключевые сущности). |
| **newData** | `new_values` / `newValues` | JSON снимок после изменения или ответа API. |
| **timestamp** | `created_at` / `createdAt` | UTC время записи. |

Дополнительно в той же строке: `organizationId`, `changes` (путь + тело для generic-мутаций), `clientIp`, `userAgent`, `hash` (SHA-256 целостности). Архивная копия — `audit_log_archives` с тем же набором полей плюс `archived_at`.

### Поведение

- **Глобальный перехватчик** NestJS (`AuditMutationInterceptor`): автоматически логирует **мутации** (`POST`, `PATCH`, `PUT`, `DELETE`) с привязкой к **`userId`** и **`organizationId`** (из JWT), за исключением публичных маршрутов auth (`/auth/login`, `/auth/register`, `/auth/refresh`). Запись в `audit_logs` выполняется **после** формирования HTTP-ответа **без ожидания** клиентом (fire-and-forget): снижает задержку ответа; при аварийном завершении процесса сразу после ответа теоретически возможна потеря последней audit-строки (см. PRD §10.0).
- Для сущностей **Invoice**, **Employee**, **Product** и для операций с **проводками** (например `POST /accounting/quick-expense` → снимок транзакции и строк `JournalEntry`) сохраняются **`oldValues`** и **`newValues`** (JSON); для прочих мутаций — запись типа `HTTP_MUTATION` с телом запроса в поле `changes`.
- В каждую запись записываются **`clientIp`**, **`userAgent`**, **`hash`** (SHA-256 от канонического JSON полей + секрет).
- **Проверка целостности:** `POST /api/audit/integrity-check` (Owner/Admin) — сверка хешей по организации; строки без хеша (legacy) учитываются отдельно.
- **Архив:** BullMQ-процесс **раз в месяц** переносит записи `AuditLog` старше **1 года** в **`AuditLogArchive`** (отключается `AUDIT_ARCHIVE_DISABLED=1`).

Продуктовое описание — [PRD.md](./PRD.md) §4.8.

---

## 10. Модуль 9: Inventory Service (склад) — обновление

### Цель

Поддержка корректировки складских остатков с немедленным отражением **отклонения себестоимости** в главной книге.

### Метод `adjustStock`

| Параметр | Описание |
|----------|----------|
| `productId` | Идентификатор номенклатуры (товара) в рамках организации |
| `quantity` | Величина корректировки в натуральных единицах (положительное число) |
| `type` | `'IN'` — оприходование (увеличение остатка); `'OUT'` — списание (уменьшение остатка) |

**Поведение:**

1. Обновить складские движения / остатки (`StockMovement` или эквивалент) в **одной БД-транзакции** с финансовой частью.
2. Создать **`Transaction`** и набор **`JournalEntry`**, отражающих **разницу стоимости** по результату корректировки (учётная себестоимость единицы × количество; метод оценки — как в действующем складском модуле — средняя / FIFO и т.д.).
3. Корреспонденции — по плану счетов и политике продукта (например ТМЦ **201**, себестоимость **701**, прочие доходы/расходы для отклонений — см. [PRD.md](./PRD.md) §4.10).
4. Контекст запроса: **`organizationId`** из JWT; валидация принадлежности `productId` организации.

**Инварианты:** `validateBalance()` для проводок; запрет мутаций в закрытом периоде (как для прочих финопераций).

### Инвентаризационная опись (v5.9)

- **Модель данных (Prisma):**
  - **`InventoryAudit`**: `id`, `organizationId`, `warehouseId` (**1 аудит = 1 склад**), `date`, `status` (`DRAFT` | `APPROVED`).
  - **`InventoryAuditLine`**: `id`, `organizationId`, `inventoryAuditId`, `productId`, `systemQty`, `factQty`, `costPrice`.
  - Уникальность строки в рамках документа: `@@unique([inventoryAuditId, productId])`.
- **UI / процесс:** **черновик (DRAFT)** создаётся для выбранного склада и формирует **снимок системных остатков** (автозаполнение строк `systemQty`, `factQty=systemQty`, `costPrice` из `StockItem.averageCost`). В DRAFT разрешено редактирование `factQty` и `costPrice`. Далее — проведение (approve).

#### §10.1 (v6.0) `InventoryAuditService` — транзакция проведения

**Note (audit sync):** Treasury cash orders were renamed **MKO/MXO → KMO/KXO**, and incoming cash orders (KMO) have an additional **KO-1** print form requirement (see §6.0).

- **Approve (проведение) выполняется атомарно**: весь процесс оборачивается в **`prisma.$transaction`**.
- **Ограничения (Compliance):**
  - Запрещено проводить документ в статусе **APPROVED** повторно.
  - Запрещено проведение и редактирование линий в **закрытом периоде** (проверка как в `AccountingService.postJournalInTransaction` через `closedPeriods`).
- **Алгоритм approve:**
  - Для каждой строки вычислить \( \Delta = factQty - systemQty \).
  - Определить `invAcc` по складу: **201** (товары) или **204** (готовая продукция) из `Warehouse.inventoryAccountCode`.
  - Если \( \Delta > 0 \): сумма \( amount = \Delta \times costPrice \) → проводка **Дт invAcc / Кт 611**, складское движение **IN**.
  - Если \( \Delta < 0 \): сумма \( amount = |\Delta| \times costPrice \) → проводка **Дт 731 / Кт invAcc**, складское движение **OUT**.
  - Все складские изменения (`StockItem.quantity`, `StockItem.averageCost` при оприходовании) и `StockMovement` (reason=ADJUSTMENT), а также создание `Transaction`/`JournalEntry` выполняются внутри одной транзакции.
- **i18n (RU/AZ) для UI инвентаризации:** ключи `inventory.audit*` используются на страницах `/inventory/audit/new`, `/inventory/audits`, `/inventory/audits/[id]` и должны проходить `npm run i18n:audit` (см. §17). Ключи включают, например: `inventory.auditTitle`, `inventory.auditSubtitle`, `inventory.auditThSystem`, `inventory.auditThFact`, `inventory.auditThDiff`, `inventory.auditThCost`, `inventory.auditThAmountDiff`, `inventory.auditTotalDiff`, `inventory.auditStatusDraft`, `inventory.auditStatusApproved`.

#### §10.2 (v14.0) Модуль Manufacturing — спецификации (ProductRecipe)

**Связь с ЦФО:** производственные и складские проводки, как и прочие операционные расходы, для P&L по подразделениям должны согласовываться с правилами **`departmentId`** в финансовых транзакциях — см. **§7.0.1** (в т.ч. быстрый расход и отличие от агрегированной зарплатной проводки).

#### Financial Reports (v16.1): Balance Sheet + Cash Flow

**Goal:** management reporting built on top of the Ledger (double-entry), using **Decimal** arithmetic on the API side.

**Balance Sheet mapping (GL → Management lines)**

Balance is generated **as of a date** (`asOfDate`, UTC, inclusive) using closing balances from the Ledger.

- **Assets**
  - **Cash & Bank**: **101.\*** (cash desks), **221.\*** (bank accounts), plus legacy **223.\*** if present.
  - **Receivables**: **211.\***
  - **Inventory / Stock**: **201.\*** (goods), **204.\*** (finished goods)
- **Liabilities**
  - **Payables**: **531.\***
  - **Payroll & taxes payable**: **521.\***, **523.\***
- **Executive widgets** (`GET /api/reports/executive-widgets`): ответ содержит **отдельные** суммы по **531** (кредиторка поставщиков) и по **521 + 523** (ЗП и налоги у источника и смежные обязательства); на дашборде не объединяются в одну KPI «кредиторка».
- **`StockMovement.documentDate`:** для метода оценки **FIFO** порядок слоёв при расчёте себестоимости списания — **`document_date` ASC**, при равенстве дат — **`created_at` ASC**; при создании движения задаётся бизнес-датой (например дата описи инвентаризации, `recognizedAt` / `createdAt` инвойса для отгрузки, текущий момент для закупки/перемещения/корректировки).
- **Equity**
  - **Charter capital**: **301.\*** (and related equity codes if present)
  - **Retained earnings / P&L result**: derived from equity / revenue / expense movements up to `asOfDate` (implementation detail in `FinancialReportService`)

**Cash Flow (Direct method)**

Cash Flow is generated for a period (`dateFrom`..`dateTo`, UTC inclusive). API: **`GET /api/reports/cash-flow`**.

- **Cash sources**:
  - **Bank** (221.\*): `BankStatementLine` с **`origin` ∈ {`FILE_IMPORT`, `MANUAL_BANK_ENTRY`}**, с привязкой к `CashFlowItem`; период — по **`valueDate`**, при отсутствии — по дате выписки.
  - **Cash desk** (101.\*): проведённые **KMO/KXO** (`CashOrder`), с привязкой к `CashFlowItem`.
- **Grouping**: by `CashFlowItem` (code + name). Category is inferred from item code:
  - `CF-INV*` → Investing
  - `CF-FIN*` → Financing
  - otherwise → Operating

**Performance / caching**

- If the number of underlying ledger entries / source rows exceeds **1000**, the API may cache the computed report in **Redis** for a short TTL (keyed by org + params).

**Цель:** базовый CRUD для производственных рецептов (из каких материалов/сырья состоит готовый товар), закрывающий требования модуля **Manufacturing** на уровне MVP.

**Схема данных (Prisma)**

| Модель | Поля | Примечания |
|--------|------|------------|
| **ProductRecipe** | `id` (UUID), `organizationId` (FK), `finishedProductId` (FK → `Product` — готовый товар, **уникален** в рамках org: одна рецептура на SKU) | Расширение имени/`yieldQuantity` на уровне рецепта — по дорожной карте; выпуск задаётся телом `POST /manufacturing/release` (`quantity` = партия). |
| **ProductRecipeLine** | `id` (UUID), `recipeId` (FK → `ProductRecipe`), `componentProductId` (FK → `Product` — сырьё/материал), `quantityPerUnit` (Decimal — расход на **1** единицу готовой продукции), **`wasteFactor`** (Decimal, по умолчанию **0** — доля технологических потерь; фактическое списание = `quantityPerUnit * (1 + wasteFactor)`) | Уникальность `(recipeId, componentProductId)` — одно сырьё не дублируется в рецепте. |

**Бизнес-логика**

- **Валидация цикла:** `finishedProductId` **не может** совпадать ни с одним `componentProductId` внутри того же рецепта (защита от рекурсивного производства). При нарушении — HTTP **400** с кодом `RECIPE_CIRCULAR_DEPENDENCY`.
- **Принадлежность:** все `Product` (готовый и компоненты) должны принадлежать тому же `organizationId`.
- `quantityPerUnit` > 0; `wasteFactor` ≥ 0 (верхняя граница в коде, напр. **2.0**, защита от ошибочного ввода).
- Партия выпуска `batchQty` > 0 — в `ReleaseProductionDto`.

**`ManufacturingService.releaseProduction`**

- Для каждой строки рецепта: `need = quantityPerUnit * (1 + wasteFactor) * batchQty`.
- Складские движения **OUT** на сумму `need`; при необходимости последующим этапом — отдельный документ **списание отходов** / побочного продукта (PRD §4.10.1).

**API (REST, префикс `/api`)**

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/manufacturing/recipes` | Список рецептур организации (пагинация, поиск по `finishedProduct.name`). |
| GET | `/manufacturing/recipes/:id` | Детали рецепта с компонентами (`lines`). |
| POST | `/manufacturing/recipes` | Создание рецепта с массивом `lines` (в одной `prisma.$transaction`). |
| PATCH | `/manufacturing/recipes/:id` | Обновление (замена массива `lines`, в т.ч. `wasteFactor`). |
| DELETE | `/manufacturing/recipes/:id` | Мягкое или жёсткое удаление (политика — при реализации; при наличии производственных ордеров — запрет). |

**Gating:** все эндпоинты защищены `@RequiresModule('manufacturing')`; при `tier === ENTERPRISE` — доступ без ограничений.

### 10.3. Взаимозачёт и НДС (НК АР)

Дополняет **§3.1** (базовая проводка **Дт 531 — Кт 211** и распределение по `InvoicePayment`).

**Налоговая логика:** при вызове **`NettingService.executeNetting`** (или эквивалент `POST /api/reporting/netting`), если **организация** и **контрагент** признаны плательщиками НДС (`Counterparty.isVatPayer === true` и флаг учёта НДС по организации — по мере появления поля), в **той же БД-транзакции** допускается формирование:

- проводок по счетам **241** (НДС к зачёту) и/или **541** (НДС к уплате) **пропорционально** сумме зачёта и ставке НДС (аналогично отражению по банковской выплате / e-qaimə);

или **без** проводок на первом этапе — только **флаг/задача** «создать e-qaimə» для интеграции с e-taxes (см. PRD §4.11).

**UX:** после успешного зачёта API может возвращать `{ suggestVatInvoice: true, amount, counterpartyId }` для мастера создания e-qaimə.

---

## 11. Технические инструкции для разработки

При генерации кода **для каждого модуля** использовать единый паттерн:

1. **DTO:** описать входные данные, валидация через `class-validator`.
2. **Service layer:** бизнес-логика с обработкой ошибок (`InternalServerErrorException` или `BadRequestException` где уместно).
3. **Controller:** REST-эндпоинты (GET, POST, PATCH, DELETE).
4. **Unit tests:** минимум один тест на финансовую логику (например, сходимость баланса транзакции).

### Docker Compose

- Сервисы: как минимум **api**, **web** (при контейнеризации фронта), **postgres**, **redis**.
- **PostgreSQL:** инициализация с расширением **`uuid-ossp`**.
- Тома: данные БД, **локальное файловое хранилище** до переезда на S3-compatible.

### API

- Документация: **Swagger (OpenAPI)** — см. PRD.

---

## 12. Дорожная карта: v2 — расширения

**Базис:** Core MVP считается реализованным; ниже — технические направления блока v2 (этот же документ). Продуктовый контекст — [PRD.md](./PRD.md) §5.

### 12.1. Multi-GAAP (параллельный учёт)

- **БД:** поле `ledgerType` (Enum: NAS, IFRS) в `JournalEntry` и `Account` (или эквивалентная модель).
- **Таблица** `AccountMapping`: `{ nasAccountId, ifrsAccountId, ratio }`.
- **Логика:** при сохранении проводки в режиме NAS — проверка маппинга и создание «теневой» копии для IFRS.
- **UI:** глобальный переключатель в хедере: «Режим учета: NAS / IFRS».

### 12.2. Дебиторка и акты сверки

- **Partial payments:** таблица `InvoicePayment` — `{ invoiceId, amount, date, transactionId }`.
- **Статусы:** `PAID` только если `SUM(InvoicePayment.amount) >= Invoice.totalAmount`; иначе `PARTIALLY_PAID`.
- **Reconciliation Service:** выборка по счетам 211 / 531 для `counterpartyId`; PDF «Акт сверки взаиморасчетов» (AZ) с полями под подписи сторон.

### 12.3. HR & Payroll — расширение

- **Оргструктура и позиции:** детальная схема Prisma, валидация штата, дерево отделов, аналитика 721/533 по департаментам — см. **§7** (модуль 6), подраздел «Организационная структура и позиции».
- **Отпуска:** справочник «Календарь отпусков»; формула отпускных: `(средняя ЗП за 12 мес / 30.4) * дни`.
- **ГПХ (VÖEN 5%):** тип сотрудника «Подрядчик (ГПХ)»; авто-расчёт: выплата минус 5% и упрощённые налоги при применимости.

### 12.4. Налоговый портал (экспорт)

- **Export Engine:** генерация файлов (например **exceljs**).
- **Шаблоны:** приложения к декларации по НДС (покупки/продажи за квартал).

### 12.5. UX/UI (Phase 2)

- Адаптивность таблиц; на мобильных — скрытие второстепенных колонок или карточки.
- **Quick Actions:** кнопка быстрого действия (создать инвойс / провести расход) на ключевых страницах.

---

## 13. Дорожная карта: v3 — интеграции и эксплуатация

**Цель:** встраивание в цифровую инфраструктуру АР (ЭЦП, гос. сервисы, банки, безопасность SaaS). Продуктовый контекст — [PRD.md](./PRD.md) §6.

**Базис:** функциональность v2.x считается реализованной; v3 наращивает интеграции и надёжность.

### 13.1. ASAN İmza / SİMA (Mobile ID)

- **UI:** на PDF-инвойсе и PDF акта сверки — действие «Подписать» (ASAN İmza / SİMA / иной Mobile ID по контракту).
- **Backend:** сессия подписания, получение подписанного пакета / detached-подпись, проверка цепочки — по спецификации провайдера.
- **Хранение:** подписанный PDF (или оригинал + подпись) в объектном хранилище (S3-совместимый слой), привязка к `organizationId`, типу сущности, id документа.
- **Аудит:** запись в `AuditLog` или `DocumentSignature`: пользователь, время, тип документа, id, алгоритм хеша, **хеш содержимого**, id сессии у провайдера.
- **API:** read-only история подписей для документа (роли по политике продукта).

### 13.2. e-taxes.gov.az и VÖEN

- **Исследование:** официальные API e-taxes / BTP; авторизация, форматы, лимиты, тестовый контур.
- **Реализация:** вариант A — прямая отправка из API; вариант B — очередь через BTP-клиент / агент при нестабильном API; UI — «Отправить в e-taxes» + журнал попыток.
- **VÖEN Lookup (MDM-first):** при вводе VÖEN UI сначала выполняет lookup в **глобальном реестре** `GlobalCounterparty` (MDM) и автозаполняет наименование/адрес/НДС-статус.
  - API: `GET /api/counterparties/global/by-voen/:taxId`
  - Если записи нет — допускается внешний lookup (e-taxes) с кэшированием и последующим созданием/обновлением записи в MDM.
  - Создание локального контрагента привязывает его к `globalId` (подписка организации на глобальные данные), при этом локальные данные сохраняются и не удаляются при изменении структуры холдинга.

**UI холдинга (создание):** страница `/holding` содержит кнопку «Новый холдинг», открывающую модальную форму (поля: `name`, `baseCurrency`) и выполняющую `POST /api/holdings`.

### 13.3. Direct Banking (Pasha Bank, ABB и др.)

- **Конфиг организации:** учётные данные / OAuth / сертификаты — только в секретах.
- **Авто-выписка:** BullMQ, целевой интервал **раз в час**; нормализация в `BankStatementLine` (или расширение модели); матчинг с инвойсами.
- **Исходящие платежи:** черновик → «На подпись директору» → формат банка (JSON/XML) → API банка → статусы (принят / на подписи / исполнен / отклонён); связь с проводкой и `InvoicePayment` при необходимости.
- **Безопасность:** раздельные права на выписки и инициацию платежей; 2FA для роли отправки (продукт или IdP).

### 13.4. Инфраструктура и безопасность (SaaS)

- **Подготовка к v4:** сущности `Subscription`, `Plan`, `ModuleEntitlement`, связь с `Organization`; платёжный шлюз (Stripe / локальный PSP — выбор на проектировании): webhooks, идемпотентность. В v3 допускается **MVP:** один тариф + оплата картой + флаг «организация активна»; полное ценообразование — v4.
- **Бэкапы:** PostgreSQL по расписанию в зашифрованный архив; файлы в S3 — lifecycle, репликация по возможности; алерт при пропуске; периодический тест восстановления (runbook).
- **Общее:** секреты в vault/env; аудит доступа к бэкапам; минимизация ПДн в логах.

### Критерии приёмки v3.0 (сводно)

1. Подписание PDF-инвойса и PDF акта сверки из UI с записью хеша в аудит.
2. Сценарий отправки налоговых данных в сторону e-taxes **или** задокументированный обход через BTP.
3. VÖEN lookup с автозаполнением имени и статуса НДС.
4. Фоновая синхронизация банка (≥1 пилот) и матчинг с инвойсами.
5. Черновой исходящий платёж в банк со статусами.
6. Автоматические бэкапы БД и S3; базовый billing-скелет для v4.

### Зависимости и риски v3

- Доступ к документации и sandbox: ASAN/SİMA, e-taxes, банки — внешние блокеры; этапы spike и пилоты.
- Версионирование адаптеров при смене API государства/банков.

---

## 14. Дорожная карта: v4 — подписки, gating, квоты, демо

**Цель:** коммерческий SaaS — тарифы, модульные права, квоты, демо и подготовка к биллингу (см. [PRD.md](./PRD.md) §7).

**Базис:** v2/v3 считаются реализованными; v4 наращивает **слой монетизации** без переписывания доменной логики учёта.

**Стек:** Prisma (PostgreSQL), NestJS API, Next.js (App Router) web.

### §14.0 Global Company Registry (v19.0)

**Цель:** единый справочник юрлиц по **VÖEN (10 цифр)** для подсказок при вводе контрагента и обогащения данных между организациями платформы (без нарушения изоляции тенанта: локальные записи остаются в `counterparties` с `organizationId`).

| Компонент | Описание |
|-----------|----------|
| **Таблица `global_company_directory`** | Уникальный ключ `tax_id`; поля: `name`, `legal_address`, `phone`, `director_name` (денормализация). |
| **Источники обновления** | При сохранении **профиля организации** (`PATCH /api/organization/settings`) и при **создании/обновлении контрагента** запись по VÖEN **асинхронно** upsert-ится в справочник (fire-and-forget). |
| **Связь с MDM** | Таблица `global_counterparties` остаётся для НДС/lookup; глобальный реестр компаний дополняет UX (Smart-fill). |
| **API чтения** | `GET /api/organization/directory/by-voen/:taxId` (JWT) — данные для автозаполнения формы контрагента. |
| **Профиль организации** | Поля `legal_address`, `phone`, `director_name`, `logo_url`, `valuation_method` (см. PRD §11.0); банковские счета — `organization_bank_accounts` (1:N). |
| **Миграция БД** | Файл в репозитории: `packages/database/prisma/migrations/20260429100000_org_profile_global_directory/migration.sql`. На стенде: `npm run db:migrate` из корня (= `migrate deploy`) с валидным `DATABASE_URL`; в CI — `prisma migrate deploy`. |

#### Customer Portal Security (гостевая ссылка на счёт)

| Аспект | Требование |
|--------|------------|
| **Токен** | Не перечисляемый идентификатор: **UUID v4** + **"."** + **HMAC-SHA256** (секрет среды `INVOICE_PORTAL_TOKEN_SECRET`, иначе fallback на `JWT_SECRET`) по строке `{invoiceId}:{uuid}`; кодировка подписи **base64url**. Значение хранится в `invoices.public_token` (уникальный индекс). |
| **Подбор** | Перебор пространства токенов практически исключён; на `GET /api/public/invoices/:token` и PDF — **rate limiting** (`@nestjs/throttler`, лимит на IP). |
| **Транспорт** | Ссылка только по **HTTPS** в проде; в ответе портала не раскрывать внутренние UUID организации сверх необходимого публичного JSON. |
| **Язык** | Опционально `counterparties.portal_locale` ∈ {`az`,`ru`,`en`}; иначе язык UI портала по **Accept-Language** браузера. |

### 14.1. Схема Prisma

**Enum `SubscriptionTier`**

```prisma
enum SubscriptionTier {
  STARTER
  BUSINESS
  ENTERPRISE
}
```

**Модель `OrganizationSubscription` (1:1 с `Organization`)**

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID / cuid | PK |
| `organizationId` | String | `@unique` |
| `tier` | `SubscriptionTier` | Текущий тариф / пресет (совместимость, демо) |
| `expiresAt` | DateTime? | Конец оплаченного периода |
| `activeModules` | Массив slug | Устаревший/параллельный реестр подключённых модулей (например `production`, `ifrs`) |
| `customConfig` | JSON? | **v8.1 — конструктор тарифа** (см. ниже) |
| `isTrial` | Boolean | Пробный период |

**`customConfig` (JSON) — структура v8.1 (рекомендуемая)**

```json
{
  "preset": "full_access_constructor",
  "modules": [
    "banking_pro",
    "manufacturing",
    "fixed_assets",
    "ifrs_mapping",
    "hr_full",
    "kassa"
  ],
  "quotas": {
    "maxEmployees": 500,
    "maxInvoicesPerMonth": 2000,
    "storageGb": 50
  }
}
```

| Поле | Назначение |
|------|------------|
| `modules` | Массив **slug** купленных модулей. Если массив **непустой**, **гейтинг v2.0** в первую очередь проверяет принадлежность slug этому списку (с алиасами: `production` → manufacturing, `ifrs` ↔ `ifrs_mapping`, `kassa` → доступ к кассе как к части banking). |
| `preset` | Имя шаблона (для поддержки и Super-Admin), не обязателен для API. |
| `quotas` | Переопределения лимитов конструктора (слайдеры); при отсутствии — используются квоты по `tier` / `SystemConfig`. |

**Правило `tier: ENTERPRISE`:** доступ ко **всем** модулям **без** перечисления `modules` (полный доступ по умолчанию).

**Миграция:** обратимая; для существующих организаций — `customConfig` может быть `null` (работает legacy-логика по `tier` + `activeModules`).

### 14.2. API: `@RequiresModule` и Guard

- Декоратор `@RequiresModule(moduleSlug)` + **SubscriptionGuard**: после auth загрузка подписки; проверка модуля: **1)** при `tier === ENTERPRISE` — разрешено; **2)** при непустом `customConfig.modules` — slug в списке (с алиасами); **3)** иначе legacy: `activeModules` + tier (как ранее).
- Ответ при отсутствии модуля: HTTP **403** с телом, например `code: "MODULE_NOT_ENTITLED"`, поле `module`. (Смысл «нужна оплата» — через этот код в UI; стандарт **402** в отрасли редок; зафиксирован **403 + machine-readable code**.)

**Эндпоинт `GET /api/subscription/me`:** возвращает `customConfig`, `modules` (объект флагов для UI), `activeModules`, `tier`, квоты.

### 14.3. Демо (релиз продукта 4.1)

При создании организации: `OrganizationSubscription` с `isTrial: true`, `tier: BUSINESS`, `expiresAt = now() + 14 days` (UTC vs локаль — зафиксировать в коде).

**Баннер на дашборде** при активном демо (`isTrial === true`, срок не истёк): тексты AZ/RU из PRD; ссылка на `/settings/subscription` или аналог — **на все дни** trial, не только при остатке ≤ 5 дней.

**Шапка приложения:** рядом с названием компании — **тариф**, **квоты** (инвойсы за месяц, сотрудники), переход к подписке (см. PRD §7.3.1).

**Главная страница:** курсы ЦБА; блок **закрытия месяца** показывается только если `GET /api/reporting/close-period-prompt` возвращает незакрытый **прошедший** UTC-месяц (самый ранний из долга); блок размещается **над** курсами; отдельная страница не обязательна. Краткие **P&L / баланс / ДДС (упрощ.)** — `GET /api/reporting/dashboard-mini` (текущий UTC-месяц, см. PRD §7.3.1).

**READ_ONLY после истечения** без оплаты: мутации POST/PATCH/DELETE по бизнес-сущностям запрещены; просмотр и экспорт по политике; HTTP **403** с кодом вроде `SUBSCRIPTION_READ_ONLY` / `TRIAL_EXPIRED`. Белый список: оплата, просмотр подписки, logout.

### 14.4. Feature gating в UI (Next.js)

- Guard layout / client для сегментов маршрутов: данные прав с API или контекста после логина.
- Без модуля — **Paywall** (описание, CTA на подписку).
- **AppShell:** скрывать пункты сайдбара для недоступных модулей; при прямом URL — paywall.

### 14.5. Квоты

- Конфиг: например `apps/api/src/constants/quotas.ts` — для каждого `SubscriptionTier` лимиты (`maxEmployees`, `maxInvoicesPerMonth`, …). Числа — политика продукта; в ТЗ закреплён **механизм**.
- **Согласование с PRD §7.1 / §7.12.3 (v10.0):** база Foundation включает **1 пользователя** на организацию; расширение — **платные пакеты** (сотрудники, диск, лимит исходящих инвойсов продаж); значения пакетов — `billing.quota_unit_pricing_v1` / `customConfig.quotas`.
- Перед `create` в сервисах — проверка счётчиков организации vs tier / квот конструктора.
- Превышение: **`QuotaExceededException`**, HTTP **402 Payment Required** с `code: "QUOTA_EXCEEDED"` и полями `quota`, `limit`, `current` (vs **403** для «нет модуля» / READ_ONLY).

### 14.6. Billing Engine (v8.8 — Dynamic Billing Constructor; ориентиры v10.0 Hybrid LEGO)

**Таблица `PricingModule` (каталог модулей)** — источник правды по ценам; начальное наполнение может соответствовать PRD §7.1 (ориентиры AZN/мес.: **Kassa Pro 15**, **Banking Pro 19**, **Warehouse 25**, **Manufacturing 39**, **HR 19**, **IFRS 29**).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | PK |
| `key` | String, unique | Slug модуля (`banking_pro`, `kassa_pro`, …) |
| `name` | String | Отображаемое имя |
| `pricePerMonth` | Decimal | Цена в AZN за месяц |

**Таблица `PricingBundle` (именованные пакеты)**

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | PK |
| `name` | String | Название пакета (например «Retail Bundle») |
| `discountPercent` | Decimal | Скидка на сумму базы+модулей пакета, % |
| `moduleKeys` | JSON (массив строк) | Ключи модулей, входящих в пакет |

**SystemConfig (база и квоты, не модули):**

| Ключ | Назначение |
|------|------------|
| `billing.foundation_monthly_azn` | Базовая цена Foundation (AZN/мес.) |
| `billing.yearly_discount_percent` | Скидка при оплате за год (по умолчанию 20) |
| `billing.quota_unit_pricing_v1` | JSON: размер блока сотрудников, цена за блок, размер пакета документов, цена за пакет |

**Расчёт (ориентир для UI и будущего checkout):**

\[
\text{TotalPrice} = \text{BasePrice} + \sum(\text{SelectedModules}) + (\text{ExtraQuotas} \times \text{UnitPrice})
\]

- **Скидка пакета:** итог после выбора модулей умножается на \((1 - \text{bundleDiscount}/100)\), если применён именованный пакет.
- **Годовая скидка:** при периоде «год» к месячному эквиваленту применяется \((1 - \text{yearlyDiscount}/100)\) к сумме за 12 месяцев (или эквивалентная логика в одной строке — зафиксировать в коде биллинга).

**API (Super-Admin):** `GET /admin/config/billing` возвращает legacy `prices`/`quotas`, а также `foundationMonthlyAzn`, `yearlyDiscountPercent`, `quotaPricing`, `pricingModules[]`, `pricingBundles[]`. Обновление: `PATCH` foundation, yearly-discount, quota-pricing; `PATCH /admin/pricing-modules/:id`; CRUD `/admin/pricing-bundles`.

### 14.7. Emergency Access Override (v8.9)

**Hardcoded bypass (только этап разработки / согласованный аккаунт):** для пользователя с email **`shirinov.chingiz@gmail.com`** метод **`SubscriptionAccessService.assertModuleAccess`** на бэкенде **безусловно разрешает** доступ ко всем модулям (не выбрасывает 403 `MODULE_NOT_ENTITLED`). Реализация: `SubscriptionGuard` передаёт `user.email` в `assertModuleAccess`; константа `EMERGENCY_MODULE_ACCESS_EMAIL` в `subscription-access.service.ts`.

**Фронтенд:** в `subscription-context` тот же email получает **снимок ENTERPRISE** через `effectiveSnapshot` (без блокировок UI). Продакшен: убрать или заменить на конфиг из env.

### 14.8. Владелец организации, схема биллинга и API (PRD §7.12, Billing v10.0)

**Цель:** зафиксировать целевую модель данных и контракты API для **биллинга платформы** (подписка DayDay ERP), не смешивая их с **инвойсами продаж** (`Invoice` в домене учёта).

**Доступ к Billing (UI и API):** только пользователь с ролью **`OWNER`** в соответствующей организации; **Admin / Accountant / User** биллинг не видят (см. PRD §7.12.1). Маршруты привязки карты и истории платежей — те же правила.

#### 14.8.1. Терминология

| Термин | Значение |
|--------|----------|
| **Owner (роль)** | `UserRole.OWNER` в `OrganizationMembership`; единственная роль с доступом к подписке, оплате и истории по организации. |
| **ownerId** | FK `organizations.owner_id → users.id` — владелец для **агрегированного счёта** и **Change Owner**; при корректных данных совпадает с пользователем, у которого в этой org роль **OWNER**. |
| **Счёт платформы** | Таблицы **`billing_invoices`** / **`billing_invoice_items`** (Prisma: `BillingInvoice`, `BillingInvoiceItem`), не `invoices` |
| **Единый месячный счёт** | Один документ `billing_invoices` на `ownerUserId` за период, с строками по **нескольким** `organizationId` (PRD §7.12.4). |

#### 14.8.2. Расширение таблицы `organizations`

| Поле | Тип | Описание |
|------|-----|----------|
| `ownerId` | UUID FK → `users.id` | Владелец; при создании org = создатель; смена — только через **Transfer** (14.8.5) |
| `basePriceSnapshot` | Decimal? | Зафиксированная базовая цена за юнит (AZN/мес.) на момент активации/последнего пересчёта |
| `status` | Enum (целевой) | `ACTIVE` \| `TRIAL` \| `SUSPENDED` — жизненный цикл доступа к org (согласовано с `OrganizationSubscription.isTrial` / `isBlocked`) |

**Миграция:** для существующих строк `ownerId` заполняется из первого пользователя с ролью `OWNER` в `OrganizationMembership` (скрипт бэкапа перед миграцией обязателен).

#### 14.8.3. Таблица `organization_modules` (нормализация модулей)

Связь **M:N** с атрибутами по организации:

| Поле | Описание |
|------|----------|
| `organizationId`, `moduleKey` | Составной PK или уникальный индекс |
| `priceSnapshot` | Цена модуля (AZN/мес.), зафиксированная при включении |
| `activatedAt` | Момент включения (для **pro-rata**) |

До внедрения строки модулей могут дублироваться из `OrganizationSubscription.activeModules` / `customConfig.modules` — при внедрении — **одна** точка правды (политика: синхронизировать в транзакции при `toggle-module`).

#### 14.8.4. Счета платформы (не Sales)

**`billing_invoices`**

| Поле | Описание |
|------|----------|
| `id` | PK |
| `ownerUserId` | FK → пользователь (плательщик, владелец организаций) |
| `totalAmount` | Итог |
| `status` | Enum: `DRAFT`, `ISSUED`, `PAID`, `OVERDUE`, … |
| `periodStart`, `periodEnd` | Месячный (или иной) расчётный период |
| `pdfLink` | URL объекта в S3-хранилище |

**`billing_invoice_items`**

| Поле | Описание |
|------|----------|
| `invoiceId` | FK → `billing_invoices` |
| `organizationId` | FK → `organizations` — разбивка по VÖEN |
| `description` | Текст строки (модуль, квота, база) |
| `amount` | Сумма строки (AZN) |

Существующая **`PaymentOrder`** может оставаться для оплаты через шлюз; связь `PaymentOrder` ↔ `BillingInvoice` добавляется при реализации (FK опционально).

#### 14.8.5. API (префикс `/api`, JWT)

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/billing/summary` | Организации, где текущий пользователь — **`OWNER`** и согласованно **`ownerId`** (портфель для биллинга); помесячные агрегаты по каждой org: база, модули, квоты; итог **`estimatedNextPayment`** на следующий цикл (сумма по портфелю). |
| GET | `/billing/invoices` | **Billing History:** список счетов платформы (`billing_invoices`) для `currentUser` как владельца — дата, период, сумма, статус, ссылка на **PDF** (`pdfLink`); пагинация. |
| GET | `/billing/invoices/:id/pdf` | Опционально: отдача PDF по id счёта (если не используется прямой URL из `pdfLink`). |
| POST | `/billing/toggle-module` | Тело: `{ organizationId, moduleKey, enabled }`. **Guard:** только **OWNER** для этой org; идемпотентность по `(org, module)`; обновление `organization_modules` и `OrganizationSubscription`; **pro-rata** при включении в середине периода. |
| POST | `/billing/transfer` | Смена владельца: **double opt-in**; в одной `prisma.$transaction`: `organizations.ownerId`, роли membership. |

Ответы **403** при отсутствии роли **OWNER** или попытке доступа к чужой организации; **404** для чужой `organizationId`.

#### 14.8.6. Платёжный цикл и pro-rata

- **Месячный цикл:** выставление счёта / списание — раз в месяц; границы периода — зафиксировать в коде (UTC или `Asia/Baku`).
- **Pro-rata:** при **включении** модуля не в начале периода: доплата \(\approx\) \((\text{price} \times \text{daysRemaining}) / \text{daysInPeriod}\); округление до 2 знаков AZN.
- **Отключение модуля (зафиксированная политика):** доступ **сохраняется до конца оплаченного расчётного периода**. Возвраты (refunds) и кредиты на баланс **не предусмотрены**. При отключении в `organization_modules` (или эквиваленте) проставляется отметка **`cancelledAt`** / **`renewsAt = null`** (отмена продления); **SubscriptionGuard** продолжает пропускать запросы по этому модулю до `periodEnd`; по наступлении нового цикла модуль исключается из активных и gating блокирует доступ.

#### 14.8.7. QuotaGuard и перехват на фронте

**Декоратор `@CheckQuota(resource)`** (Nest): метаданные для ресурса (`USERS`, `INVOICES_PER_MONTH`, `STORAGE` — квота хранилища дополняется проверками в сервисах загрузки файлов / PDF). Guard вызывает **`QuotaService`** до мутации; при превышении — **`QuotaExceededException` → HTTP 402** с телом `QUOTA_EXCEEDED`.

**Фронтенд:** глобальный перехват в `apiFetch` для `402` + `code === "QUOTA_EXCEEDED"` — событие **`dayday:quota-upgrade`** и отображение модалки апгрейда (тот же UX-паттерн, что и `SUBSCRIPTION_READ_ONLY`).

#### 14.8.8. Вебхуки платёжных систем (v23.0)

| Метод | Путь | Назначение |
|-------|------|------------|
| POST | `/api/billing/webhooks/:provider` | Приём уведомления шлюза (`mock`, `pasha`, `pasha_bank`). **Публичный** маршрут (`@Public()`): без JWT. |

- **Подпись:** тело `{ orderId, status, signature, externalId? }`; проверка HMAC как у PAŞA Bank mock/реального шлюза (`PashaBankPaymentProvider.verifyWebhookSignature`). Неверная подпись → **401**.
- **Идемпотентность:** перевод `PaymentOrder` из `PENDING` в `PAID` через **`updateMany`** с условием `status = PENDING`; повторный вебхук не продлевает подписку повторно. Запись **`SubscriptionInvoice`** — с защитой от дубликата по `paymentOrderId`.
- **Побочные эффекты при успехе:** обновление **`OrganizationSubscription`** (продление `expiresAt` / модули по metadata pro-rata), запись в **`audit_logs`** с `organizationId = null`, `entityType = platform.billing.payment_applied` (глобальный аудит платформы).
- **Legacy:** `POST /api/public/billing/webhook` сохраняется для совместимости; новые заказы используют callback URL на **`/api/billing/webhooks/pasha_bank`**.

---

### Критерии приёмки v4.0 (сводно)

1. `SubscriptionTier` и `OrganizationSubscription` 1:1; миграция без потери данных.
2. API платных модулей отклоняет запросы без slug в `activeModules` с документированным JSON.
3. UI скрывает меню и показывает paywall при прямом заходе без права.
4. Создание сотрудника/инвойса блокируется при превышении квоты с предсказуемым кодом.
5. Лимиты централизованы в `quotas.ts`, без «магических чисел» в сервисах.
6. Демо: регистрация → trial BUSINESS, +14 дней; баннер на дашборде на все дни trial; после истечения без оплаты — READ_ONLY.

### Зависимости и риски v4

- Синхронизация slug между Prisma, Guard, Next.js и маркетингом.
- Кэш подписки на запрос (короткий TTL) при частых проверках.
- Следующий этап: платёжный шлюз, webhooks, обновление `expiresAt` / `activeModules` — см. PRD, биллинг MVP.

---

## 15. Платформа: Admin Panel (Super-Back-office)

> В [PRD.md](./PRD.md) соответствующий блок — **§7.6**. Ниже — архитектура **платформенной** админки (не путать с **модулем 6** HR в §7 этого документа).

### 15.1. Архитектура Супер-админа

**Безопасность**

- Роль **SUPER_ADMIN** (флаг в профиле): не привязана к конкретной организации в смысле доступа к данным — эндпоинты супер-админа **обходят** фильтрацию по `organizationId` и отдают данные по всей системе.
- **Guard:** `SuperAdminGuard` — проверка `isSuperAdmin` в JWT/профиле.

**Схема данных (расширение)**

- **`SystemConfig`:** ключ–значение (JSON): цены тарифов, квоты, системные сообщения.
- **`TranslationOverride`:** переопределения строк i18n поверх статических файлов (`resources.ts` на web). В бандле дублируются краткие строки **`paymentHistory.*`** (страница истории) и **`subscriptionSettings.paymentHistory.*`** (тот же смысл в блоке подписки); при оверрайдах из БД не использовать родительский ключ вместо вложенных полей.

**Эндпоинты (REST, префикс `/api`)**

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/admin/stats` | Сводка: выручка (сумма оплаченных заказов), новые пользователи за 24 ч, число организаций, активные триалы. |
| GET | `/admin/organizations` | Список компаний с пагинацией и поиском по VÖEN/названию. |
| PATCH | `/admin/organizations/:id/subscription` | Принудительное продление, блокировка, смена тарифа. |
| GET/PATCH | `/admin/config/billing` | Чтение цен, квот, Foundation, каталога `PricingModules`, `PricingBundles` (через `SystemConfig` + Prisma). |
| PATCH | `/admin/config/billing/foundation`, `/yearly-discount`, `/quota-pricing` | База, годовая скидка, единицы квот. |
| PATCH | `/admin/pricing-modules/:id` | Цена модуля в каталоге. |
| POST/PATCH/DELETE | `/admin/pricing-bundles`, `/admin/pricing-bundles/:id` | Пакеты (Paket yaradıcısı). |
| GET/POST/DELETE | `/admin/translations` | Редактор переводов; `POST /admin/translations/sync` — инкремент версии кэша для клиентов. |
| GET | `/public/translations?locale=` | Публичная выдача переопределений для слияния на клиенте. |
| GET | `/admin/audit-logs` | Глобальный просмотр `AuditLog` с фильтром по `organizationId`. |
| POST | `/admin/impersonate/:userId` | Выдача токенов от имени пользователя (поддержка). |

**Биллинг:** `GET /billing/plans` и поле `tier` в `POST /billing/checkout` — цены из `SystemConfig`, не из констант.

### 15.2. Tarif Konstruktoru (конструктор тарифов, v8.1+; UI v8.8)

**Цель:** в Super-Admin задать **цены конструктора** и **именованные пакеты** (см. PRD §7.1).

| Элемент | Описание |
|---------|----------|
| **Прайс-лист** | Вкладка **«Прайс-лист» / Qiymət siyahısı**: секция **Foundation** (базовая цена), таблица **модулей** из `PricingModules` (цена/мес.), секция **квот** — единицы расширения (`billing.quota_unit_pricing_v1`) и **годовая скидка** (%). |
| **Paket yaradıcısı** | Вкладка **«Paket yaradıcısı»**: выбор модулей **переключателями (switch)**, имя пакета, **скидка пакета** (%), **предпросмотр** для клиента (месяц / год с учётом годовой скидки); сохранение в `PricingBundles`. |
| **Стиль** | Карточки: `CARD_CONTAINER_CLASS`, палитра **#34495E** / **#2980B9** (см. DESIGN.md). |
| **Связь с БД** | Модули и пакеты — таблицы **`pricing_modules`**, **`pricing_bundles`**; база, квоты и годовая скидка — `SystemConfig`. Подписка организации — по-прежнему `OrganizationSubscription.customConfig` + `tier`. |

Legacy-цены тиров (`billing.price.STARTER` и т.д.) остаются в API для совместимости; основной UX v8.8 — конструктор, не три карточки тиров.

---

## 16. Платформа (v5.6): изоляция тенантов и асинхронность

### Prisma Extension (Strict Multi-tenancy)

- **`PrismaService`** строится с **`$extends`**: перехват операций `find*`, `update*`, `delete*`, `create*`, `count`, `aggregate` (по моделям с полем `organizationId`) для **принудительного** слияния условия `organizationId` с контекстом текущего запроса.
- **Сырой SQL:** см. **§2** — `TenantPrismaRawService` + `executePlatformRawUnsafe` для не-тенантного DDL.
- **Контекст:** `AsyncLocalStorage` (или эквивалент), заполняется HTTP-interceptor’ом из JWT (`organizationId`); для маршрутов **`/api/admin`** при `isSuperAdmin` — режим без фильтра по тенанту (только для платформенных эндпоинтов).
- **Исключения:** модели без тенанта (`User`, `Organization`, `SystemConfig`, `TranslationOverride` и т.д.) не подмешивают `organizationId`.
- **Воркеры BullMQ:** в начале обработки job выставляют тот же контекст (`organizationId` из payload) либо `skipTenantFilter` для глобальных задач (например архив аудита).

### Async Processing (BullMQ)

- Операции с **настраиваемым порогом** по числу затронутых сущностей (например тяжёлые импорты) выполняются **асинхронно** через BullMQ: API возвращает **`jobId`**, клиент опрашивает статус / отображает прогресс (конкретные пороги — в коде соответствующих сервисов).
- **Зарплата:** очередь **`payroll-heavy`**; порог **`PAYROLL_ENTITY_ASYNC_THRESHOLD`** (см. **§7** — при **0** черновик и проведение ставятся в очередь при ненулевом числе сотрудников / листов). Статус: **`GET /api/hr/payroll/jobs/:jobId`**.

### Квоты и продукт

- Явная проверка **лимита числа организаций на пользователя** (`maxOrganizations` по эффективному тиру) при создании новой организации уже существующим пользователем.

### 16.1. Soft Delete (архивация сущностей)

**Цель:** не разрушать целостность при удалении; соответствие PRD §12.

| Модель (этап внедрения) | Поведение |
|-------------------------|-----------|
| **`Organization`**, **`Holding`** (в коде v1; **`Transaction`** — целевое расширение с фильтрацией в отчётах / журнале) | Вместо физического `delete`: установить **`isDeleted: true`**, **`deletedAt = now()`** (или только `deletedAt`). |
| **Чтение** | Расширение Prisma **`$extends`**: для **Organization** / **Holding** — `findMany` / `findFirst` / агрегаты с фильтром **`isDeleted: false`**; `delete` перенаправляется в **`update`**. |

**Миграции:** добавление колонок и бэкфилл `false`/`null` — отдельной миграцией; до внедрения **hard delete** на критичных таблицах запрещён политикой код-ревью.

---

## 17. Платформа (v5.7): консистентность данных и UX

### Validation Layer (Strict Sync с §2)

- Глобальный **`ValidationPipe`** в `main.ts`: **`whitelist: true`**, **`forbidNonWhitelisted: true`**, **`transform: true`**. Неизвестные поля в теле запроса **не отбрасываются молча** — клиент получает **400 Bad Request**; описанные в DTO поля проходят в `class-validator` / `class-transformer`.
- DTO (`*.dto.ts`): без **`any`**; идентификаторы — **`@IsUUID()`**; числа — **`@IsNumber()`** / **`@Min()`**; даты — **`@IsDateString()`** / ISO; перечисления — **`@IsIn()`** / **`@IsEnum()`**.

### Transaction Pattern (Finance / Inventory / HR)

- Операции, затрагивающие **более одной записи** или **проводки + доменные сущности**, оформляются как **`this.prisma.$transaction(async (tx) => { ... })`**, с передачей **`tx`** в **`AccountingService.postJournalInTransaction`** при необходимости.
- **Примеры:** проведение зарплаты (проводки + обновление `PayrollRun`); закупка/списание/корректировка склада; инвойсы (смена статуса с выручкой/COGS/оплатой) — в рамках существующего кода.

### UI (web)

- Таблицы без строк: компонент **Empty State**; мутации с ошибкой **4xx/5xx** — **toast** (Sonner); кнопки подтверждения — **disabled** и состояние загрузки на время запроса.

### i18n CI (v14.0)

- CI pipeline **обязан** включать шаг **`npm run i18n:audit`**, гарантирующий полноту ключей локализации для **RU** и **AZ** локалей. Сборка должна **завершаться ошибкой** при обнаружении пропущенных ключей. Скрипт сканирует **все** страницы и компоненты web-приложения (`apps/web`) на предмет обращений к `t(...)` / `useTranslation` и сверяет с `resources.ts` (или эквивалентным источником статических переводов). EN — рекомендуется, но не блокирует сборку на текущем этапе.

---

## 18. История версий документа ТЗ

| Раздел / трек | Содержание |
|----------------|------------|
| **§1–§10** | Инфраструктура; модули продукта **1–9** (см. заголовки §2–§10); §3.1 — взаимозачёт (дополнение к модулю 2) |
| **§11** | Паттерн разработки, Docker, API |
| **§12 (v2)** | Multi-GAAP, дебиторка/акты сверки, расширение HR, экспорт НДС, UX Phase 2 |
| **§13 (v3)** | ЭЦП, e-taxes, VÖEN, Direct Banking, бэкапы, billing-скелет |
| **§14 (v4)** | Prisma subscription, guards, демо, UI gating, квоты |
| **§14 (v8.1)** | `customConfig.modules`, гейтинг v2.0, `GET /subscription/me` |
| **§14.8** | Billing v10.0: Owner-only; единый месячный счёт на `ownerUserId`; `GET /billing/invoices` (history + PDF); `ownerId`, `organization_modules`, `billing_invoice_items`; см. [PRD.md](./PRD.md) §7.12 |
| **§15** | Super-Admin back-office; **§15.2** Tarif Konstruktoru |
| **§16–§17** | Prisma extension / BullMQ; validation, транзакции, UX polish |
| **v5.8** | Модуль 15 (RBAC / policies), `forbidNonWhitelisted`, Policy Guard — §2, §17 |
| **v5.9** | `InventoryAudit`, строгая синхронизация формулировок §2 и §17; RC1 — политики на взаимозачёт и ручные проводки |
| **v14.0** | §14.8.6 — политика отключения модуля (доступ до конца периода, без refund); §17 — i18n CI (`npm run i18n:audit` обязателен в pipeline, RU+AZ); §10.2 — Manufacturing MVP: `ProductRecipe`, `ProductRecipeLine` + **`wasteFactor`**, CRUD `/api/manufacturing/recipes`, валидация цикла, gating `manufacturing` |
| **v14.1** | §6.0.1 — кассовый разрыв при backdated MXO; §1.1 / `CurrencyConverterService` + `Holding.baseCurrency`; §10.3 — НДС при взаимозачёте (241/541); §14.8.7 — **402** + модалка; §16.1 — soft delete **Organization** / **Holding** |
| **§6.0 / PRD §4.12** | Модуль Cash (M5): REST `/api/treasury/*`, `/api/banking/cash/*`, `POST /api/banking/manual-entry`; DTO `CreateCashFlowItemDto`, `CreateCashDeskDto`, `CreatePkoDraftDto`, `CreateRkoDraftDto`, `ManualBankEntryDto`; проведение ордеров (MKO/MXO) с ДДС, кассой, удержанием на **521**; таблицы `cash_flow_items`, `cash_desks`, колонки `cash_orders` / `bank_statement_lines`, enum `MANUAL_BANK_ENTRY` |
| **§7.0 / PRD §4.6.1** | `AbsenceType`, `Absence.absenceTypeId`, enum `AbsencePayFormula`; `GET /api/hr/absence-types`, калькуляторы vacation/sick, синхронизация табеля; ссылки на **muhasib.az** (məzuniyyət haqqı) |
| **v14.2** | §7.0 — канонические коды **LABOR_LEAVE**, **SOCIAL_LEAVE**, **UNPAID_LEAVE**, **EDUCATIONAL_LEAVE**, **SICK_LEAVE** + `description`; reconcile старых кодов при `GET /api/hr/absence-types`; черновик payroll с утверждённым табелем — корректировка gross (30.4, больничный по эпизодам, без оплаты по рабочим дням) |
| **v14.3** | Внедрение реляционной инвентаризации: `InventoryAudit` + `InventoryAuditLine` (1:N), проведение описи атомарно в `prisma.$transaction` (проводки 201/204↔611/731 + `StockMovement` ADJUSTMENT), UI полноэкранного редактора с realtime‑расчётами; унификация UI‑модалок по проекту (единые футеры/кнопки и i18n‑ключи) |
| **v14.4** | Fix: холдинг `/api/holdings/:id/summary` — корректная консолидация Cash/Bank как сумма строк по дочерним компаниям (round-per-row, чтобы total совпадал с таблицей); конвертация в базовую валюту по дате `asOf` с логированием FX ошибок без обнуления сумм |
| **v25.0** | **§0.0** — реестр эндпоинтов (`/api/admin/chart-template`, `/api/billing/webhooks`, `/api/reports/cash-flow`, jobs payroll); **§7.0.1** — `departmentId` для QuickExpense vs агрегированная ЗП; **§10.2** — ссылка на ЦФО; **§16** — BullMQ/payroll пороги; прямой ДДС — происхождение банковских строк; сырой SQL — переименование заголовка §2 (реализация `TenantPrismaRawService`) |

Актуальная спецификация — **этот `TZ.md`**; при изменениях править только его.

---

*Конец документа.*
