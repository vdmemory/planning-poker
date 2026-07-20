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
- Маркетинговые страницы (issue #22, лендинг переработан под оба продукта — follow-up): `/` — лендинг с общим hero («Real-time tools for agile teams», два равноправных CTA) → две quick-nav карточки-якоря → отдельная секция Planning Poker (скриншот, «как это работает», фичи, CTA) → отдельная секция Retro Board (свой скриншот, свои шаги, свои фичи, свой CTA) → общий bottom CTA; `/faq` — вопросы сгруппированы по продукту (Planning Poker / Retro Board). Header/footer (`MarketingShell.tsx`) несут ссылку на оба продукта. Форма создания комнаты — на `/new`, доски — на `/retro/new`
- **Retro Board** (issue #62): второй независимый продукт на том же сайте — живая доска для ретроспектив через WebSocket, полное описание — в разделе [«Retro Board»](#retro-board) ниже

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
│   ├── LandingPage.tsx   # маркетинговый лендинг на `/` (issue #22) — по секции на каждый продукт
│   ├── FAQPage.tsx       # `/faq` — вопросы сгруппированы по продукту
│   ├── Home.tsx          # создание комнаты, теперь на `/new`
│   └── RoomPage.tsx      # игровой экран
├── components/
│   ├── MarketingShell.tsx # общий header/footer для лендинга и FAQ, ссылки на оба продукта
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

**Retro Board** — полностью параллельный домен (`retro_models.py`, `retro_store.py`, `retro_service.py`, `retro_ws_manager.py`), не расширение `Room`/`RoomService`. Роуты `/retro/new` и `/retro/:boardId` на фронте, `/api/retro-boards` и `/ws/retro/{board_id}` на бэке. Полное описание — раздел [«Retro Board»](#retro-board) ниже.

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

## Retro Board

Второй независимый продукт на том же сайте (issue #62) — живая доска для ретроспектив через WebSocket. Полностью параллельный домен: свои модели/store/сервис/WS-роутер, **не** расширение `Room`/`RoomService` — общий код только доменно-нейтральный `ConnectionManager`. Вход с лендинга (`/`) или напрямую на `/retro/new`.

### Возможности

- Гостевые доски по короткой ссылке, без регистрации — как и комнаты Planning Poker
- 3 preset-шаблона колонок: Mad/Sad/Glad, Start/Stop/Continue, 4Ls (Liked/Learned/Lacked/Longed for)
- Карточки видны всем сразу, без reveal-механики — в отличие от голосов Planning Poker, скрывать тут нечего
- Голосование с общим бюджетом на участника (по умолчанию 5, настраивается фасилитатором) — бюджет общий на всю доску, а не по карточке
- Anonymous mode: скрывает автора карточки от всех, кроме него самого (display-only — `author_id` всё равно остаётся на wire для permission-проверок, это не серверная приватность)
- Таймер с абсолютным дедлайном (`timer_ends_at`, пресеты 3/5/10 минут); по достижении нуля — пульсирующий бейдж «Time's up!» на клиенте мгновенно + автопауза на сервере через фоновую задачу `expire_finished_timers`
- Drag-to-merge группировка карточек (Pointer Events, не HTML5 Drag-and-Drop — работает и мышью, и пальцем) с confirm-диалогом перед слиянием и кнопкой undo; смёрженные карточки рендерятся как одна карточка с текстами через «---», один общий голос и автор
- Текстовые комментарии к карточке (issue #65) — кнопка сразу после голоса, попап-тред снизу карточки; добавить может любой участник, удалить — только автор комментария или фасилитатор
- Эмодзи-пикер, GIF-поиск (через GIPHY, серверный прокси без API-ключа на клиенте) и вставка картинки по прямой ссылке при создании/редактировании карточки (issue #66) — только внешний URL, без загрузки файлов на свой сервер
- Панель быстрых реакций в шапке (issue #68) — эмодзи-only клон Planning Poker's ReactionsPanel (без time-value режима), рисует floater в левом нижнем углу у всех участников; throttle 600ms
- Kick участника фасилитатором, закрытие доски для всех
- Настройки доски (`RetroSettingsModal`, открывается кликом по имени доски — только фасилитатор) и профиль участника (`RetroProfileMenu`, открывается кликом по аватарке) — клоны `GameSettingsModal`/`ProfileMenu` из Planning Poker
- Рисование на экране и live-курсоры — тот же компонент `DrawingCanvas`, что и в Planning Poker, переиспользован без форка
- Кастомные цвета аватара, темы оформления и акценты — общие с Planning Poker (тот же `localStorage`, переключение темы синхронно в обоих продуктах)
- Мобильная адаптация: ручка перетаскивания работает одинаково пальцем и мышью
- Дружелюбные full-screen overlay'и для всех «board is no longer available» сценариев: kicked, closed, expired, not_found — как и в Planning Poker
- Авто-реконнект через 30s grace-период, авто-закрытие доски через 24h — тот же механизм, что и у комнат

### Архитектура

```
backend/app/
├── retro_models.py      # Pydantic-модели: RetroTemplate, RetroColumn, RETRO_TEMPLATES,
│                        # RetroParticipant, RetroCard, RetroBoard
├── retro_store.py       # RetroBoardStore (Protocol) + InMemoryRetroBoardStore
├── retro_service.py     # RetroService — вся бизнес-логика, без зависимости от HTTP/WS
├── retro_ws_manager.py  # переиспользует ConnectionManager + свои фоновые задачи:
│                        # cleanup_disconnected_participants (5s), cleanup_expired_boards (60s),
│                        # expire_finished_timers (1s, автопауза истёкшего таймера)
├── gif_client.py        # issue #66 — прокси к GIPHY search API, держит GIPHY_API_KEY на сервере
└── main.py              # + REST POST/GET /api/retro-boards, GET /api/retro-boards/gif-search,
                         # WS /ws/retro/{board_id}, handle_retro_message — параллельный диспетчер сообщений

frontend/src/
├── pages/
│   ├── RetroNewPage.tsx        # `/retro/new` — форма создания доски
│   └── RetroBoardPage.tsx      # `/retro/:boardId` — join-модалка + сама доска
├── components/
│   ├── RetroTemplatePicker.tsx
│   ├── RetroColumn.tsx         # рендерит стопки карточек (head + сгруппированные дети)
│   ├── RetroCardItem.tsx       # одна (never-grouped) карточка: inline-edit, vote, drag, comments
│   ├── RetroCardStack.tsx      # смёрженная карточка: тексты через "---", общий голос/автор, undo
│   ├── RetroCardCommentThread.tsx # issue #65 — попап-тред комментариев, общий для Item/Stack
│   ├── RetroCardAttachmentPicker.tsx # issue #66 — эмодзи-грид + GIF-поиск + прямой URL
│   ├── RetroReactionsPanel.tsx  # issue #68 — клон ReactionsPanel, эмодзи-only, в шапке
│   ├── RetroTimer.tsx          # + бейдж "Time's up!"
│   ├── RetroSettingsModal.tsx  # клон GameSettingsModal
│   └── RetroProfileMenu.tsx    # клон ProfileMenu без spectator-тумблера
├── hooks/
│   ├── useRetroSocket.ts       # WebSocket с авто-реконнектом, аналог useRoomSocket
│   ├── useRetroCardDrag.ts     # Pointer Events drag-to-merge state
│   └── useRetroReactions.ts     # issue #68 — floater-очередь для header self-reaction
└── lib/
    └── insertTextAtCursor.ts    # issue #66 — вставка эмодзи в позицию курсора textarea
```

Подробности архитектуры — `docs/ARCHITECTURE.md` → «Retro Board», полная бизнес-логика — `docs/RETRO_BUSINESS_LOGIC.md`.

### REST

| Method | Path | Описание |
|---|---|---|
| `POST` | `/api/retro-boards` | Создать доску. Body: `{ name, template, facilitator_nickname }`. Возвращает `board_id`, `participant_id`, `state`. |
| `GET`  | `/api/retro-boards/gif-search` | GIF-поиск (issue #66), query `?q=`. Проксирует к GIPHY, ключ `GIPHY_API_KEY` не покидает сервер. Возвращает `{ results: [{ id, preview_url, url, title }] }`; `503` если ключ не настроен или апстрим недоступен. **Зарегистрирован ДО `{board_id}` ниже** — иначе Starlette матчил бы `gif-search` как id доски. |
| `GET`  | `/api/retro-boards/{board_id}` | Текущее состояние доски. |

### WebSocket-протокол

Подключение: `wss://<backend>/ws/retro/{board_id}?participant_id=...&nickname=...`

Если `participant_id` уже есть в доске — реконнект. Если нет, но передан `nickname` — авто-создаётся участник (для шаринга инвайт-ссылок), как и в Planning Poker.

**Client → Server**

| Type | Payload | Кто может |
|---|---|---|
| `add_card` | `{ column_id, text, image_url? }` | любой участник; `image_url` опционален (issue #66) |
| `edit_card` | `{ card_id, text, image_url? }` | автор карточки или фасилитатор; опустить `image_url` = убрать картинку, нет partial-update (issue #66) |
| `delete_card` | `{ card_id }` | автор карточки или фасилитатор |
| `vote_card` / `unvote_card` | `{ card_id }` | любой участник, в рамках бюджета голосов |
| `group_cards` | `{ source_card_id, target_card_id }` | автор исходной карточки или фасилитатор |
| `ungroup_card` | `{ card_id }` | автор карточки или фасилитатор |
| `add_comment` | `{ card_id, text }` | любой участник (issue #65) |
| `delete_comment` | `{ card_id, comment_id }` | автор комментария или фасилитатор (issue #65) |
| `reaction` | `{ value }` | любой участник; header self-reaction, не привязана к карточке; релей всем включая отправителя (issue #68) |
| `start_timer` | `{ seconds }` | facilitator |
| `pause_timer` / `resume_timer` / `reset_timer` | — | facilitator |
| `update_board` | `{ name?, anonymous_mode?, max_votes_per_person? }` | facilitator |
| `update_nickname` | `{ nickname }` | сам участник |
| `update_avatar_color` | `{ color }` | сам участник |
| `kick_participant` | `{ target_id }` | facilitator |
| `close_board` | — | facilitator |
| `draw_stroke` / `draw_cursor` / `draw_clear` | payload рисования | релей всем кроме отправителя |

**Server → Client**

| Type | Когда |
|---|---|
| `joined` | После успешного подключения. `{ participant_id }` |
| `board_state` | После любой успешной операции, broadcast всем. `{ state }` — карточки несут `comments` (issue #65), отдельного типа сообщения для них нет |
| `reaction` | Релей header self-reaction (`reaction`) всем, включая отправителя (issue #68) |
| `kicked` | Прилетает кикнутому участнику перед закрытием соединения |
| `board_closed` | Доска закрыта фасилитатором. `{ reason: "creator_left" }` |
| `board_expired` | Истёк 24h-таймер доски, шлётся уже подключённым. `{ reason: "timer" }` |
| `board_inactive` | На свежий WS-connect: доска отсутствует или истекла. `{ reason: "not_found" \| "expired" }` |
| `draw_*` | Релей рисования, обогащённый `player_id`/`nickname` отправителя |
| `error` | `{ message }` |

### Шаблоны колонок

Определены в `retro_models.py:RETRO_TEMPLATES`:

| Шаблон | Колонки |
|---|---|
| `went_well_extended` **(дефолт)** | What went well, To improve, Risks, Action items, How do you find the team's processes? |
| `went_well_actions` | What went well, To improve, Action items |
| `mad_sad_glad` | Mad, Sad, Glad |
| `start_stop_continue` | Start, Stop, Continue |
| `four_ls` | Liked, Learned, Lacked, Longed for |

Расширенный 5-колоночный шаблон — первый в списке `RetroTemplatePicker.tsx` и выбран по умолчанию на `/retro/new` (issue #67); тот же дефолт продублирован на REST-уровне (`CreateRetroBoardRequest.template` в `main.py`) на случай прямого вызова API без поля `template`.

Id колонок — стабильные строки (`mad`, `sad`, …), а не uuid: в Phase 1 нет переупорядочивания/кастомизации колонок, поэтому ссылки на них в `add_card` остаются осмысленными на весь срок жизни доски.

### Голосование

`RetroBoard.votes_used_by(participant_id)` считает, сколько голосов участник потратил суммарно по всем карточкам доски — бюджет (`max_votes_per_person`, по умолчанию 5) общий на всю доску, не на карточку. `vote_card` отклоняется, если бюджет исчерпан.

### Таймер и «Time's up»

Абсолютный дедлайн (`timer_ends_at`), а не серверный тик — клиент сам считает live-countdown (`RetroTimer.tsx`, `setInterval` каждые 250мс). По достижении нуля клиент мгновенно показывает пульсирующий бейдж «Time's up!» (сравнение с реальным временем, а не со стейл-состоянием, чтобы свежезапущенный таймер не мигал бейджем), прячет кнопки Pause/Resume — из них ничего больше не имеет смысла — и оставляет только Reset. Фоновая задача `expire_finished_timers` (1s интервал, тот же паттерн, что и другие periodic-задачи) автопаузит таймер на сервере (`timer_running=false`, `timer_remaining_seconds=0`), чтобы остальные участники и те, кто зайдёт позже, видели тот же статус.

### Поведение при дисконнекте и lifecycle доски

Зеркалит Planning Poker: `mark_disconnected` → фоновая задача `cleanup_disconnected_participants` удаляет участников с дисконнектом > 30s каждые 5s; `reconnect()` снимает offline-флаг при возврате; `participant_id` в `localStorage` → рефреш = реконнект как тот же участник; при уходе фасилитатора роль переходит к первому из оставшихся. Доска живёт 24 часа (`expires_at`), `cleanup_expired_boards` проверяет это каждые 60s и рассылает `board_expired`.

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
| Backend (pytest) | `backend/tests/` | `pytest` | 243 тестов — 125 Planning Poker (комнаты, голосование, issues, права, WS-интеграция) + 118 Retro Board (доски, карточки, голосование, таймер + auto-expiry, группировка, drawing relay, header self-reaction, комментарии, вложения/GIF-поиск, WS) |
| Frontend e2e (Playwright) | `frontend/tests/e2e/` | `npm run test:e2e` | 91 тестов — 52 Planning Poker/общие (лендинг с обоими продуктами, FAQ, создание/голосование, reveal+stats, два игрока, мобильные флоу, throw-reaction, UI-анимации и др.) + 39 Retro Board |

CI: GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) гоняет оба слоя на каждый push в `main`/`dev` и на каждый PR. При падении e2e — артефакты (видео, скриншоты) аплоадятся.

Подробности — в [docs/TESTING.md](docs/TESTING.md).

## Что НЕ входит сейчас

- Регистрация и БД (всё в памяти; история игр не хранится)
- Интеграции с Jira/Linear/GitHub
- Биллинг и тарифы
