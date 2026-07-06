# Архитектура

## Высокоуровневый вид

```
┌──────────────────────────────┐      WebSocket (ws/wss)      ┌──────────────────────────────┐
│  Браузер (React + Vite)      │ ───────────────────────────► │  FastAPI (Python 3.12)       │
│  pages/RoomPage              │                              │  /ws/{room_id}               │
│  hooks/useRoomSocket         │ ◄─── room_state broadcast ── │  RoomService (in-memory)     │
└──────────────────────────────┘                              └──────────────────────────────┘
        ▲                                                                    ▲
        │  REST /api/rooms (создание комнаты)                                │
        └────────────────────────────────────────────────────────────────────┘
```

Два независимых сервиса, общего кода нет:
- **Frontend** — React + Vite + TypeScript + Tailwind. Деплой: Vercel.
- **Backend** — FastAPI + uvicorn. Всё состояние в памяти процесса. Деплой: Render.
- Между ними — REST для bootstrap и WebSocket для real-time.

## Структура бэка

```
backend/app/
├── models.py       Pydantic-модели домена: Room, Player, Issue, DeckType, DECKS
├── store.py        RoomStore (Protocol) + InMemoryRoomStore singleton
├── services.py     RoomService — вся бизнес-логика, без FastAPI
├── ws_manager.py   ConnectionManager + фоновая cleanup-задача дисконнектов
└── main.py         FastAPI: REST + WebSocket-роутер, делегирует в RoomService
```

### Слои и ответственности

| Слой | Файл | Делает | НЕ делает |
|---|---|---|---|
| Транспорт | `main.py` | парсит HTTP/WS, диспатчит в сервис, broadcast | бизнес-логику |
| Сервис | `services.py` | все мутации комнаты, валидации, политика прав | I/O |
| Хранилище | `store.py` | get / save / delete / all | бизнес-логику |
| Транспорт WS | `ws_manager.py` | карта соединений, broadcast, cleanup | мутации модели |
| Модель | `models.py` | Pydantic-модели + `public_state()` | хранение |

**Поток** для типичного WS-сообщения:
1. Клиент шлёт `{type: "vote", card: "5"}`.
2. `main.py:handle_message` парсит и зовёт `service.vote(...)`.
3. `RoomService.vote` валидирует (не зритель, карты не открыты, карта в колоде), пишет `room.votes[...]`, сохраняет в store.
4. `main.py` после успеха делает `room.public_state()` и broadcast'ит `room_state` всем в комнате.

Это разделение позволяет тестировать сервис юнит-тестами без поднятой FastAPI.

### Хранилище как Protocol

`store.py` определяет `RoomStore` как структурный протокол:

```python
class RoomStore(Protocol):
    def get(self, room_id: str) -> Optional[Room]: ...
    def save(self, room: Room) -> None: ...
    def delete(self, room_id: str) -> None: ...
    def all(self) -> list[Room]: ...
```

Сейчас live-инстанс — `InMemoryRoomStore`. Чтобы переехать на Redis: реализуйте `RedisRoomStore`, удовлетворяющий этому протоколу, и подмените singleton `store` в `store.py`. Никаких других изменений в кодовой базе не требуется.

### WebSocket менеджер

`ws_manager.py:ConnectionManager` держит `dict[room_id, dict[player_id, WebSocket]]` в памяти процесса. Методы:
- `connect`, `disconnect` — учёт соединений
- `send_to(room_id, player_id, msg)`
- `broadcast(room_id, msg)`
- `broadcast_except(room_id, except_player_id, msg)` — для drawing/cursor
- `close_connection(room_id, player_id, code)` — для kick

**Cleanup**: `cleanup_disconnected_players(service)` запускается как `asyncio.create_task` в `lifespan` и каждые 5 секунд удаляет игроков с `disconnected_at` старше 30s. Если в комнате не осталось игроков — комната удаляется из store.

**Room expiration**: вторая фоновая задача `cleanup_expired_rooms(service)` стартует в том же `lifespan` и раз в 60 секунд проверяет `Room.is_expired()`. Для каждой expired-комнаты: broadcast'ит `{type: "room_expired", reason: "timer"}` всем подключённым клиентам, закрывает их WS с кодом 4005, удаляет комнату из store через `RoomService.expire_room`. Дефолтный lifetime — 24 часа (`services.ROOM_LIFETIME`), monkeypatch'ится в тестах. Подробности и UX-флоу на фронте — в `docs/BUSINESS_LOGIC.md` секция «Lifecycle комнаты и истечение таймера».

**Внимание (масштабирование)**: connection map хранится в памяти одного пода. Для горизонтального масштабирования нужен Redis pub/sub: broadcast превращается в publish в канал комнаты, каждый под слушает свои каналы.

### Auto-join по URL

WS-эндпоинт принимает `?player_id=...&nickname=...`. Логика:
1. Если `player_id` уже в комнате → реконнект (снять offline-флаг, обновить ник).
2. Если `player_id` НЕ в комнате, но передан `nickname` → создать игрока с этим ником, выдать новый id, ответить `{type: "joined", player_id}`.
3. Если ни того, ни другого → закрыть соединение с кодом 4001.

Это даёт инвайт-ссылку «открыл → ввёл ник → играешь», без отдельного REST-вызова на join.

### Дисконнект и grace-период

```
WebSocketDisconnect
    │
    ▼
mark_disconnected(player) → connected=False, disconnected_at=now
    │
    ▼
[фоновая задача каждые 5s]
    │
    ▼
disconnected_at старше 30s? → remove_player
    │                              │
    │                              ▼
    │            facilitator ушёл? → передать роль первому из оставшихся
    │                              │
    │                              ▼
    │                  в комнате никого? → delete(room)
    │
    └── успел вернуться?
            │
            ▼
        reconnect(player) → connected=True, disconnected_at=None
```

`player_id` сохраняется в браузере (`localStorage`), поэтому page refresh = реконнект как тот же игрок без потери голоса/прав фасилитатора.

## Структура фронта

```
frontend/src/
├── pages/
│   ├── LandingPage.tsx   маркетинговый лендинг на `/` (issue #22): hero, «как это работает», фичи, скриншот комнаты
│   ├── FAQPage.tsx       `/faq`
│   ├── Home.tsx          форма создания комнаты (`/new` — до issue #22 была на `/`), POST /api/rooms
│   └── RoomPage.tsx      игровой экран; всё под одним WS-каналом
├── components/
│   ├── MarketingShell.tsx общий header (лого + nav) / footer для лендинга и FAQ
│   ├── Card.tsx          одна карта (на руке + на столе)
│   ├── PlayerList.tsx    список игроков с offline-индикатором, аватарами
│   ├── StatsPanel.tsx    avg / median / distribution / consensus
│   └── IssueSidebar.tsx  список задач (drag, edit, link)
├── hooks/
│   └── useRoomSocket.ts  WS с авто-реконнектом, persistent player_id
└── types.ts              типы, синхронизированные с public_state()
```

### Роуты фронта (`main.tsx`)

| Path | Компонент | Что |
|---|---|---|
| `/` | `LandingPage` | Маркетинговый лендинг, гостевой вход (issue #22) |
| `/faq` | `FAQPage` | FAQ |
| `/new` | `Home` | Форма создания комнаты — POST `/api/rooms` |
| `/room/:roomId` | `RoomPage` | Игровой экран |

Лендинг и FAQ не трогают бэкенд и WS вообще — чисто фронтовый роутинг, общий `MarketingShell` для header/footer. Скриншот комнаты на лендинге переключается между `public/landing/room-dark.png` / `room-light.png` по классу `html.light` (тот же механизм, что и остальная тема приложения — см. `useTheme`), а не по `prefers-color-scheme`, потому что выбор темы в приложении — explicit user choice в `localStorage`, а не всегда совпадает с OS-preference.

### `useRoomSocket`

Главный кастом-хук:
- Открывает WS, отправляет `nickname` при первом коннекте.
- Хранит `player_id` в `localStorage` под ключом `pp:player:{roomId}`.
- На разрыв запускает экспоненциальный backoff (макс ~10s).
- Слушает входящие `room_state` и кладёт в стейт. Экспортирует `sendMessage(payload)`.

Всё, что компоненты делают, — читают стейт и зовут `sendMessage(...)`. Никаких REST-запросов из RoomPage нет.

### Состояние

Стейт фронта = серверный `room_state` 1-в-1 + локальные UI-флаги (модалки, отображение настроек). Источник правды — бэкенд: после каждого действия прилетает свежий `room_state`, и фронт перерисовывает.

## Транспортные форматы

### REST

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/api/rooms` | `{ name, deck_type, facilitator_nickname }` | `{ room_id, player_id, state }` |
| `GET`  | `/api/rooms/{room_id}` | — | `{ state }` |
| `GET`  | `/healthz` | — | `{"status":"ok"}` |

### WebSocket

Полный список см. в `README.md` и `main.py:handle_message`. Краткая сводка:

**Client → Server**: `vote`, `revote`, `reveal`, `reset`, `countdown`, `add_issue`, `update_issue`, `delete_issue`, `delete_all_issues`, `reorder_issue`, `select_issue`, `set_estimate`, `update_room`, `update_nickname`, `update_avatar_color`, `toggle_spectator`, `kick_player`, `close_room`, `draw_stroke`, `draw_cursor`, `draw_clear`.

**Server → Client**: `joined`, `room_state` (+ optional `stats`), `countdown`, `kicked`, `room_closed`, `draw_*`, `error`.

После любой мутации состояния — broadcast `room_state` всем в комнате. `draw_*` и `countdown` — релей без broadcast'а `room_state`.

## Ветки и деплой

См. `README.md`. Кратко:

```
main → Render(planning-poker-backend)    → Vercel Production    → <project>.vercel.app
dev  → Render(planning-poker-backend-dev) → Vercel Preview scope → <project>-git-dev-<owner>.vercel.app
```

Один Blueprint `render.yaml` создаёт оба бэк-сервиса. Один Vercel-проект имеет scope-разделённый `VITE_API_URL`.

## Невидимые ограничения (важно держать в голове)

- **Всё в памяти**. Рестарт бэка = потеря всех комнат. Принято осознанно ради простоты MVP.
- **Один процесс** (ws_manager + cleanup task). Горизонтально не масштабируется без Redis pub/sub.
- **CORS** не управляется кодом, а только env var `CORS_ORIGINS`. При добавлении нового фронт-URL — обновить переменную в Render.
- **Free tier Render** засыпает после ~15 минут неактивности. Холодный старт ~30s, фронт переподключается автоматически.
- **WS-соединение требует `https://` на фронте** для апгрейда до `wss://`. Mixed-content браузер заблокирует.
