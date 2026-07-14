# Planning Poker

Real-time инструмент для оценки задач agile-командой. Гостевой режим (без регистрации), голосование через WebSocket, всё состояние — в памяти бэка.

## Стек

- **Frontend**: React 18 + Vite + TypeScript + Tailwind
- **Backend**: FastAPI + WebSocket (Python 3.12)
- **Storage**: in-memory (с заделом под Redis — `RoomStore` это Protocol в `store.py`)
- **Deploy**: Vercel (frontend) + Render (backend)

## Возможности

- Гостевые комнаты по короткой ссылке, без регистрации
- 4 колоды: Fibonacci, Powers of 2, Sequential 1–10, T-shirt
- Голосование скрыто до открытия карт; среднее/медиана/распределение/консенсус
- Авто-простановка финальной оценки из mode (самая частая карта) при reveal
- Re-vote после открытия карт — стата и оценка пересчитываются
- Issues: добавление/редактирование/удаление/переупорядочивание, link на тикет
- Настройки комнаты: кто может открывать карты (facilitator/everyone), кто управляет задачами
- Spectator-режим (игрок видит, но не голосует)
- Кастомные цвета аватара и рубашка карты
- Темы оформления: светлая / тёмная / system + 7 акцентов (blue/green/red/purple/yellow/orange/teal), все 14 комбинаций подобраны вручную для контраста (issue #42)
- Kick игрока фасилитатором, закрытие комнаты
- Drawing: рисование на экране и live-курсоры (мышью и пальцем на тачскрине); штрихи автоматически исчезают через 5s (Slack-style)
- Mobile-friendly: issues-сайдбар превращается в выезжающий drawer, карточки/шрифты адаптивны, модалки не вылезают за экран на коротких viewport'ах (issue #23)
- Quick reactions: 10 анимированных эмодзи (Lottie-флоатеры, Google Noto Animated Emoji, прозрачный фон) + 10 time-values (1h..6h + 1d/12h/2d/3d) с pop-overlay над карточкой и Google Meet-style анимацией подъёма; throttle 600ms
- Throw reactions (issue #51): наведи на карточку другого игрока — вылезет панель с эмодзи (🎯✈️🧻❤️ + «+» на ещё 10), клик анимированно кидает эмодзи в его карточку у всех участников; опция room-wide, включается фасилитатором в Game Settings
- ConfirmModal для деструктивных действий (delete issue, close room, kick player) с ESC и backdrop-cancel
- Countdown перед reveal
- Авто-реконнект через 30s grace-период; `player_id` сохраняется в `localStorage`
- Передача роли фасилитатора, если он покинул комнату — или (issue #19) опциональное закрытие комнаты для всех вместо handoff'а через настройку «Close room when facilitator leaves»
- Дружелюбные full-screen overlay'и для всех «room is no longer available» сценариев: истёкший таймер (⌛), закрытие фасилитатором (🚪, issue #19), кик участника (👋, issue #37), неверный URL (🔗) — везде кнопка «Back to home»
- Авто-закрытие комнаты через 24h (timer expiration), full-screen уведомление для участников
- Маркетинговые страницы (issue #22): `/` — лендинг (hero, «как это работает», фичи, скриншот комнаты в обеих темах), `/faq`. Форма создания комнаты переехала на `/new`
- **Retro Board** (issue #62): второй независимый продукт на том же сайте — доска для ретроспектив через WebSocket. 3 preset-шаблона колонок (Mad/Sad/Glad, Start/Stop/Continue, 4Ls), карточки видны сразу всем (без reveal), голосование с общим бюджетом на участника, anonymous mode, таймер, kick/close (Phase 1) + drag-to-merge группировка карточек, эмодзи-реакции на карточки, мобильная адаптация (Phase 2) — см. `docs/RETRO_BUSINESS_LOGIC.md`. Вход с лендинга или напрямую на `/retro/new`

## Запуск локально

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Бэкенд: `http://localhost:8000`. Healthcheck: `GET /healthz`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Открыть `http://localhost:5173`. Vite проксирует `/api` и `/ws` на бэкенд, env-переменных в деве не нужно.

## Архитектура

```
backend/app/
├── models.py         # Pydantic-модели: Room, Player, Issue, DeckType, DECKS
├── store.py          # RoomStore (Protocol) + InMemoryRoomStore. Подменяется на Redis
├── services.py       # RoomService — вся бизнес-логика, без зависимости от HTTP/WS
├── ws_manager.py     # ConnectionManager + cleanup-задача дисконнектов (30s grace)
└── main.py           # FastAPI: REST /api/rooms, WS /ws/{room_id}

frontend/src/
├── pages/
│   ├── LandingPage.tsx   # маркетинговый лендинг на `/` (issue #22)
│   ├── FAQPage.tsx       # `/faq`
│   ├── Home.tsx          # создание комнаты, теперь на `/new`
│   └── RoomPage.tsx      # игровой экран
├── components/
│   ├── MarketingShell.tsx # общий header/footer для лендинга и FAQ
│   ├── Card.tsx          # карта голосования
│   ├── PlayerList.tsx    # список игроков с offline-индикатором
│   ├── StatsPanel.tsx    # среднее/медиана/распределение/консенсус
│   └── IssueSidebar.tsx  # список задач + добавление
├── hooks/
│   └── useRoomSocket.ts  # WebSocket с авто-реконнектом и сохранением player_id
└── types.ts              # типы, синхронизированные с бэком
```

### Слои бэкенда

- **`main.py`** только парсит HTTP/WS и делегирует в сервис. Каждое успешное действие приводит к broadcast `room_state` всем в комнате.
- **`services.py:RoomService`** — вся бизнес-логика. Тестируется без FastAPI.
- **`store.py`** — `RoomStore` это структурный Protocol. Сейчас `InMemoryRoomStore`. Чтобы переехать на Redis — реализовать тот же протокол и подменить singleton `store`.
- **`ws_manager.py`** — карта `room_id → player_id → WebSocket` + фоновая задача, которая каждые 5s удаляет игроков с `disconnected_at` старше 30s.

**Retro Board** — полностью параллельный домен (`retro_models.py`, `retro_store.py`, `retro_service.py`, `retro_ws_manager.py`), не расширение `Room`/`RoomService`. Роуты `/retro/new` и `/retro/:boardId` на фронте, `/api/retro-boards` и `/ws/retro/{board_id}` на бэке. Подробности архитектуры — `docs/ARCHITECTURE.md` → «Retro Board», бизнес-логика — `docs/RETRO_BUSINESS_LOGIC.md`.

## REST

| Method | Path | Описание |
|---|---|---|
| `POST` | `/api/rooms` | Создать комнату. Body: `{ name, deck_type, facilitator_nickname }`. Возвращает `room_id`, `player_id`, `state`. |
| `GET`  | `/api/rooms/{room_id}` | Текущее состояние комнаты. |
| `GET`  | `/healthz` | `{"status":"ok"}` — для Render healthcheck. |

## WebSocket-протокол

Подключение: `wss://<backend>/ws/{room_id}?player_id=...&nickname=...`

Если `player_id` уже есть в комнате — реконнект. Если нет, но передан `nickname` — авто-создаётся игрок (для шаринга инвайт-ссылок).

**Client → Server**

| Type | Payload | Кто может |
|---|---|---|
| `vote` | `{ card }` | любой непрозритель |
| `revote` | `{ card }` | любой непрозритель, после reveal |
| `reveal` | — | facilitator (или everyone, если `who_can_reveal=everyone`) |
| `reset` | — | facilitator (или everyone, если `who_can_reveal=everyone`) |
| `countdown` | `{ seconds }` | релей всем для анимации |
| `add_issue` | `{ title, description?, link? }` | по `who_can_manage_issues` |
| `update_issue` | `{ issue_id, title?, description?, link? }` | по `who_can_manage_issues` |
| `delete_issue` | `{ issue_id }` | по `who_can_manage_issues` |
| `delete_all_issues` | — | по `who_can_manage_issues` |
| `reorder_issue` | `{ issue_id, direction: "top"\|"up"\|"down"\|"bottom" }` | по `who_can_manage_issues` |
| `select_issue` | `{ issue_id }` | по `who_can_manage_issues` |
| `set_estimate` | `{ issue_id, estimate }` | по `who_can_manage_issues` |
| `update_room` | `{ name?, deck_type?, card_back?, who_can_reveal?, who_can_manage_issues?, close_on_facilitator_leave? }` | facilitator |
| `update_nickname` | `{ nickname }` | сам игрок |
| `update_avatar_color` | `{ color }` | сам игрок |
| `toggle_spectator` | — | сам игрок (не facilitator) |
| `kick_player` | `{ target_player_id }` | facilitator |
| `close_room` | — | facilitator |
| `draw_stroke` / `draw_cursor` / `draw_clear` | payload рисования | релей всем кроме отправителя |
| `reaction` | `{ kind: "emoji" \| "number", value }` | любой; релей всем включая отправителя |

**Server → Client**

| Type | Когда |
|---|---|
| `joined` | После успешного подключения. `{ player_id }` |
| `room_state` | После любой успешной операции, broadcast всем. `{ state, stats? }` (stats только после reveal/revote) |
| `countdown` | Релей для анимации перед reveal |
| `kicked` | Прилетает кикнутому игроку перед закрытием соединения. Фронт показывает overlay «You were removed from this room» (issue #37). |
| `room_closed` | Комната закрыта фасилитатором — явно (`close_room`) или из-за `close_on_facilitator_leave` (issue #19). `{ reason: "creator_left" }`. |
| `room_expired` | Истёк таймер комнаты, шлётся уже подключённым. `{ reason: "timer" }`. |
| `room_inactive` | На свежий WS-connect: комната отсутствует или истекла. `{ reason: "not_found" \| "expired" }`. |
| `draw_*` | Релей рисования |
| `error` | `{ message }` |

## Голосование и стата

`compute_stats(room)`:
- `average`, `median` — только по числовым картам (T-shirt и `?` не входят)
- `distribution` — словарь карта → количество голосов
- `consensus` — `true`, если все проголосовали одинаково
- `total_votes` — сколько игроков проголосовало

При reveal автоматически проставляется `final_estimate` текущей задачи как mode голосов. При revote — пересчитывается.

## Колоды

Определены в `models.py:DECKS`:

| Колода | Карты |
|---|---|
| `fibonacci` | 0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, ?, ☕ |
| `powers_of_2` | 0, 1, 2, 4, 8, 16, 32, 64, ?, ☕ |
| `sequential` | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ?, ☕ |
| `tshirt` | XS, S, M, L, XL, XXL, ? |

Карты — строки, чтобы поддерживать `?`, `☕` и T-shirt одинаково.

## Поведение при дисконнекте

1. Игрок теряет соединение → `WebSocketDisconnect`.
2. `mark_disconnected` ставит `connected=False` и `disconnected_at=now`. В UI игрок становится серым с пометкой offline.
3. Фоновая задача `cleanup_disconnected_players` каждые 5s удаляет игроков с дисконнектом > 30s.
4. Если игрок успел вернуться — `reconnect()` снимает offline-флаг и обновляет ник.
5. `player_id` хранится в `localStorage` → рефреш = реконнект как тот же игрок.
6. Если ушёл фасилитатор и был удалён — роль переходит к первому из оставшихся.

## Ветки и деплой

Используем **две долгоживущие ветки**:

| Ветка | Среда | Backend (Render) | Frontend (Vercel) |
|---|---|---|---|
| `main` | Production | `planning-poker-backend` | Production scope |
| `dev`  | Staging    | `planning-poker-backend-dev` | Preview scope (alias `*-git-dev-*.vercel.app`) |

**Правило**: в `main` ничего не вливается напрямую. Сначала `dev` → ревью → merge в `main`. Обе ветки задеплоены и доступны на отдельных URL.

### Backend (Render Blueprint)

Источник истины: [`render.yaml`](render.yaml) в корне — он описывает оба сервиса (main и dev).

1. Первичная настройка (один раз): Render Dashboard → **Blueprints** → **New Blueprint Instance** → подключить GitHub-репо `planning-poker`. Render прочитает `render.yaml` и создаст оба Web Service:
   - `planning-poker-backend` (deploy on push to `main`)
   - `planning-poker-backend-dev` (deploy on push to `dev`)
2. Для каждого сервиса в Environment задать `CORS_ORIGINS` (без trailing slash):
   - prod: `https://<vercel-prod>.vercel.app`
   - dev:  `https://<vercel-dev-alias>.vercel.app` (Vercel-alias для ветки dev)
3. Healthcheck: `GET /healthz` → `{"status":"ok"}` на обоих сервисах.

### Frontend (Vercel)

Один Vercel-проект, две scope-настройки env var:

1. Импортировать `planning-poker` → Root Directory: **`frontend`** (Vite).
2. Production Branch: `main` (по умолчанию).
3. Environment Variables → `VITE_API_URL`:
   - **Production scope**: prod Render URL (`https://planning-poker-backend.onrender.com`)
   - **Preview scope**: dev Render URL (`https://planning-poker-backend-dev.onrender.com`)
4. Vercel автоматически даст ветке `dev` стабильный alias `<project>-git-dev-<owner>.vercel.app`. Этот URL добавить в `CORS_ORIGINS` dev-сервиса на Render.

Конфиг: [`frontend/vercel.json`](frontend/vercel.json).

### CORS

- В деве: `CORS_ORIGINS` не задана → `allow_origins=["*"]`.
- В проде/staging: Render читает `CORS_ORIGINS` и ограничивает.

### Заметки

- Render free tier засыпает после неактивности (~15 мин). Первый запрос — холодный старт ~30s, фронт переподключится автоматически.
- В `backend/` остались `Dockerfile`, `Procfile`, `railway.toml`, `nixpacks.toml` — устаревшие артефакты от прошлых платформ. На Render не используются.

## Заделы под будущее

| Что | Где | Что менять |
|---|---|---|
| Redis вместо памяти | `store.py` | реализовать `RoomStore` поверх Redis |
| OAuth / регистрация | новый `auth.py` | middleware, `Player.user_id` |
| Биллинг | новый `billing.py` | policy-проверки в `services.py` |
| Кастомные колоды | `models.py:DECKS` | расширить enum + UI |
| Интеграции (Jira/Linear/CSV) | новый `integrations/` | импорт в `Room.issues` |
| Горизонтальное масштабирование | `ws_manager.py` | Redis pub/sub для broadcast между подами |

## Релизы

Формальных релизов нет: push в `main` → автодеплой на Render+Vercel, и это весь «релиз». Никаких тегов, версий, CHANGELOG'ов автоматизация не генерит.

Цикл одной фичи:
1. Push feature ветки → `sync-to-dev` зеркалит её в `dev` (preview-деплой)
2. AUTO: `auto-pr-to-main` открывает PR `<branch> → main`
3. Ты ревьюишь → **Squash and merge** → автодеплой на production

Подробности и обоснование «почему без release-please» — в [docs/RELEASES.md](docs/RELEASES.md).

## Тесты

| Слой | Где | Команда | Покрытие |
|---|---|---|---|
| Backend (pytest) | `backend/tests/` | `pytest` | 213 тестов — 125 Planning Poker (комнаты, голосование, issues, права, WS-интеграция) + 88 Retro Board (доски, карточки, голосование, таймер, группировка, реакции, WS) |
| Frontend e2e (Playwright) | `frontend/tests/e2e/` | `npm run test:e2e` | 66 тестов — 50 Planning Poker (лендинг/FAQ, создание/голосование, reveal+stats, два игрока, мобильные флоу, throw-reaction, UI-анимации и др.) + 16 Retro Board |

CI: GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) гоняет оба слоя на каждый push в `main`/`dev` и на каждый PR. При падении e2e — артефакты (видео, скриншоты) аплоадятся.

Подробности — в [docs/TESTING.md](docs/TESTING.md).

## Что НЕ входит сейчас

- Регистрация и БД (всё в памяти; история игр не хранится)
- Интеграции с Jira/Linear/GitHub
- Биллинг и тарифы
