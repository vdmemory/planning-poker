# Planning Poker

Внутренний инструмент для оценки задач agile-командой. Гостевой режим (без регистрации),
real-time голосование через WebSocket.

## Стек

- **Frontend**: React 18 + Vite + TypeScript + Tailwind
- **Backend**: FastAPI + WebSocket
- **Storage**: in-memory (с заделом под Redis)

## Запуск локально

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Бэкенд поднимется на `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Открыть `http://localhost:5173`. Vite проксирует `/api` и `/ws` на бэкенд.

## Архитектура

```
backend/app/
├── models.py         # Pydantic-модели: Room, Player, Issue, DECKS
├── store.py          # RoomStore (Protocol) + InMemoryRoomStore. Подменяется на Redis
├── services.py       # RoomService — вся бизнес-логика, без зависимости от HTTP/WS
├── ws_manager.py     # ConnectionManager + cleanup-задача для дисконнектов (30s grace)
└── main.py           # FastAPI app: REST /api/rooms, WS /ws/{room_id}

frontend/src/
├── pages/
│   ├── Home.tsx          # создание комнаты
│   └── RoomPage.tsx      # игровой экран
├── components/
│   ├── Card.tsx          # карта голосования
│   ├── PlayerList.tsx    # список игроков с offline-индикатором
│   ├── StatsPanel.tsx    # среднее/медиана/распределение/консенсус
│   └── IssueSidebar.tsx  # список задач + добавление
├── hooks/
│   └── useRoomSocket.ts  # WebSocket с авто-реконнектом и сохранением player_id
└── types.ts              # типы, синхронизированные с бэком
```

## WebSocket-протокол

**Client → Server:**
- `{ type: "vote", card: "5" }`
- `{ type: "reveal" }` (только фасилитатор)
- `{ type: "reset" }` (только фасилитатор)
- `{ type: "add_issue", title, description? }` (только фасилитатор)
- `{ type: "select_issue", issue_id }` (только фасилитатор)
- `{ type: "set_estimate", issue_id, estimate }` (только фасилитатор)

**Server → Client:**
- `{ type: "joined", player_id }` — после успешного подключения
- `{ type: "room_state", state, stats? }` — обновление состояния (stats есть после reveal)
- `{ type: "error", message }`

## Заделы под будущее

| Что | Где | Что менять |
|---|---|---|
| Redis вместо памяти | `store.py` | реализовать `RoomStore` поверх Redis |
| OAuth/регистрация | новый `auth.py` | добавить middleware, дать `Player.user_id` |
| Биллинг | новый `billing.py` | навесить policy-проверки в `services.py` |
| Кастомные колоды | `models.py:DECKS` | расширить enum + UI-форма |
| Интеграции (Jira/Linear/CSV) | новый `integrations/` | импорт в `Room.issues` |
| Горизонтальное масштабирование | `ws_manager.py` | Redis pub/sub для broadcast между подами |

## Поведение при дисконнекте

1. Игрок теряет соединение → ws_endpoint ловит `WebSocketDisconnect`.
2. `mark_disconnected` ставит `connected=False` и `disconnected_at=now`. У всех в UI игрок становится серым с пометкой "offline".
3. Фоновая задача `cleanup_disconnected_players` каждые 5 сек удаляет игроков, у которых дисконнект > 30 сек.
4. Если игрок успел вернуться — `reconnect()` снимает offline-флаг.
5. `player_id` сохраняется в `localStorage`, поэтому рефреш страницы = реконнект как тот же игрок.

## Что НЕ входит в MVP

- Регистрация и БД (всё в памяти, история игр не хранится)
- Интеграции с Jira/Linear/GitHub
- Кастомные колоды (можно добавить за час — расширить `DECKS`)
- Биллинг и тарифы
- Тесты (для production нужно дописать pytest на `RoomService`)
