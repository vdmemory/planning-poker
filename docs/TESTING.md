# Тесты

В репо два уровня тестов. Оба — исполняемая документация: имя теста читается как
спецификация, тело — как пример «что должно произойти».

## Сводка

| Уровень | Где | Технология | Скорость |
|---|---|---|---|
| Backend service + WS | `backend/tests/` | pytest + FastAPI TestClient | 92 теста, <0.1s |
| Frontend e2e | `frontend/tests/e2e/` | Playwright + Chromium | 5 тестов, ~15s |

## Backend (pytest)

```bash
cd backend
source .venv/bin/activate
pip install -r requirements-dev.txt   # один раз
pytest                                # все 92 теста
pytest tests/test_voting_and_stats.py # один файл
pytest -k "facilitator"               # все тесты со словом "facilitator"
```

### Слои

Два фикстура из `conftest.py`:

- **`service`** — фресь `RoomService` поверх свежего `InMemoryRoomStore`. Используется
  для всего, что про бизнес-логику. Самый быстрый, ничего не сетапит, не поднимает HTTP.
- **`client`** — FastAPI `TestClient` против реального `app`. Между тестами чистит
  глобальный `store._rooms`. Используется для REST + WebSocket.

### Что покрыто

| Файл | Описание | Тестов |
|---|---|---|
| `test_rooms_and_players.py` | Создание комнаты, join/leave/kick/close, facilitator-handoff, disconnect grace, spectator-флаг, обновление ника/цвета | 25 |
| `test_voting_and_stats.py` | Скрытые голоса до reveal, валидация карт, reveal→stats, revote, reset, mode → final_estimate, числовые vs не-числовые карты | 20 |
| `test_issues.py` | add/update/delete/reorder/select/set_estimate; авто-выбор первой задачи; что происходит при удалении активной | 19 |
| `test_permissions_and_settings.py` | `who_can_reveal`, `who_can_manage_issues`, facilitator-only действия, partial-update комнаты | 12 |
| `test_websocket.py` | REST + WS интеграция: auto-join по URL, broadcast, error reply, countdown/draw relay, kick закрывает соединение, room_closed | 16 |

### Что НЕ покрыто

- Реальный 30-секундный grace-период (только семантика помечена; полный тайминг — flaky)
- Drawing-сообщения в деталях (только relay-механика)
- Бэк под нагрузкой / race conditions (не цель)

## Frontend e2e (Playwright)

```bash
cd frontend
npm install                          # включает @playwright/test
npx playwright install chromium      # один раз
npm run test:e2e                     # headless
npm run test:e2e:headed              # видимый браузер
npm run test:e2e:ui                  # Playwright UI
```

### Что Playwright поднимает

Конфиг (`playwright.config.ts`) запускает **отдельные** инстансы:
- бэкенд: `uvicorn app.main:app --port 8765`
- фронт: `VITE_API_URL=http://localhost:8765 VITE_DISABLE_STRICT_MODE=true npx vite --port 5174`

Это не конфликтует с твоим обычным `npm run dev` / `uvicorn --reload`. После последнего
теста процессы остаются висеть для скорости повторного запуска (поведение
`reuseExistingServer`). Чтобы их убить:

```bash
pkill -f "vite --port 5174"
pkill -f "uvicorn.*8765"
```

### Почему `VITE_DISABLE_STRICT_MODE=true`

В dev-режиме React.StrictMode двойно монтирует хуки. `useRoomSocket` открывает WS,
оно закрывается на размонтировании, потом открывается снова. На сервере успевает
создаться лишний игрок (auto-join: первый WS послал пустой `player_id`, сервер создал
Bob, потом ws закрылся, потом второй WS пришёл с уже сохранённым id, реконнект). В
тестах это даёт «1/3 voted» вместо «1/2». В проде StrictMode не активен — проблемы нет.

`main.tsx` отключает StrictMode по флагу.

### Что покрыто

| Файл | Флоу |
|---|---|
| `home.spec.ts` | Главная рендерится; create-game с пустым именем показывает ошибку, не навигирует |
| `create-and-vote.spec.ts` | Фасилитатор создаёт комнату → голосует → «Reveal cards» появляется |
| `reveal-and-stats.spec.ts` | Голосует → Reveal → «Average» + «New round»; New round сбрасывает |
| `two-players.spec.ts` | Два контекста (две сессии) в одной комнате → видят друг друга → оба голосуют → reveal на одном → обе видят stats |
| `mobile-flows.spec.ts` | Issue #23 — те же 5 ключевых флоу на viewport 375×667 (iPhone SE) с `hasTouch: true`: создание комнаты + join по ссылке, голос+reveal, Game Settings (проверка что Save помещается в viewport), issues-drawer (добавить+выбрать issue), рисование пальцем через синтетические `TouchEvent`; + два регрессионных теста, которые кликают конкретное значение в `EstimatePicker`/`RevotePicker` на мобиле и проверяют что оно **реально применилось** (не просто что модалка открылась) — см. `docs/BUSINESS_LOGIC.md` раздел «Баг: выбор в мобильной модалке не применялся» |

### Helpers (`tests/e2e/helpers.ts`)

- `createRoom(page, gameName?, facilitatorNick?)` — Home → создать → ввести ник → ждать WS.
- `joinRoom(page, url, nickname, asSpectator?)` — открыть URL комнаты как другой пользователь.
- `voteCard(page, card, confirmRegex?)` — кликает карту с повторами, пока на странице не появится подтверждение (по умолчанию «All voted!»). Polling нужен потому что в коротком окне между HTTP-навигацией и WS-handshake первый клик может улететь в no-op (`send()` дропает сообщения, если ws.readyState !== OPEN).

### Мобильные тесты и ловушка с `.first()` (issue #23)

`mobile-flows.spec.ts` не переиспользует `voteCard`/текстовые локаторы 1-в-1 из десктопных тестов, потому что ниже `md` в DOM одновременно присутствуют **обе** копии стола — `PokerTable` (`hidden md:flex`) и мобильный fallback (`md:hidden`) — CSS прячет только одну. Locator по тексту/роли матчит обе, и `.first()` берёт первую **в DOM-порядке**, а не первую видимую — на мобильном viewport'е это чаще всего скрытая desktop-копия, и `expect(...).toBeVisible()` зависает до таймаута. Паттерн, которым это обходится в `mobile-flows.spec.ts`:

```ts
const visible = (l: Locator) => l.and(page.locator(":visible")).first();
await expect(visible(page.getByText(/all voted/i))).toBeVisible();
```

Локальный запуск: `npm run test:e2e` гоняет и `mobile-flows.spec.ts` вместе со всеми остальными спеками (single Chromium project, viewport переопределяется через `test.use()` внутри файла). Чтобы посмотреть тот же экран глазами — Chrome DevTools → Toggle device toolbar → выбрать iPhone SE / iPhone 14 / iPad mini, либо `npm run test:e2e:headed` на этом файле.

Playwright здесь гоняет desktop Chromium с эмулированным viewport/touch — это **не** то же самое, что настоящий iOS Safari или Android Chrome (разный рендеринг клавиатуры, разное поведение `dvh`, разные touch-квирки). Issue #23 явно требует ручной smoke-test на реальном устройстве перед мерджем — это отдельный шаг, автоматические тесты его не заменяют.

### Что НЕ покрыто

- Live-курсоры и кросс-клиентский relay рисования (только локальное состояние одного клиента проверяется)
- Мультитач / стилус в рисовании — только один палец (`e.touches[0]`), MVP-решение по issue #23
- Visual regression (нет screenshot baselines)
- Тесты на медленных соединениях / cold start Render (offline-индикатор)

## Тесты как документация — правило

См. `docs/RULES.md` пункт 13: при изменении бизнес-логики обновлять `BUSINESS_LOGIC.md`
и добавлять/менять backend-тест в `backend/tests/`; при изменении UI-флоу — добавлять
Playwright-тест. Без этого бизнес-правило «есть только на словах», и через месяц
никто не помнит, что оно было.

## Запуск всех тестов одним хитом

```bash
# Backend
cd backend && source .venv/bin/activate && pytest --timeout=10

# Frontend e2e
cd ../frontend && npm run test:e2e
```

Backend 0.1s + Playwright ~15s локально.

## CI

GitHub Actions: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

Триггеры:
- push в `main` или `dev`
- pull_request в `main` или `dev`

Два job'а параллельно:

| Job | Что делает | Таймаут |
|---|---|---|
| `backend` | `pip install -r requirements-dev.txt` → `pytest --timeout=10 -v` | 5 мин |
| `e2e` | install backend deps + Node deps + Playwright Chromium → `npm run test:e2e` (с `CI=true`, без reuse-existing-server) | 15 мин |

Оба job'а пользуются:
- `concurrency.cancel-in-progress` — новый push отменяет предыдущий ран на той же ветке;
- кэшем pip и npm — повторные раны быстрее;
- кэшем Playwright-браузеров по `package-lock.json`-hash.

При падении e2e job — `playwright-report/` и `test-results/` (видео, скриншоты) аплоадятся как артефакт, доступны 7 дней.

### Что важно знать

- `playwright.config.ts` авто-активирует `backend/.venv/` если файл `backend/.venv/bin/activate` существует — поэтому локально `npm run test:e2e` работает без предварительного `source`. В CI venv нет, и команда `python -m uvicorn` резолвится в Python раннера, куда workflow поставил зависимости.
- `CI=true` отключает `reuseExistingServer` — на CI всегда стартуют свежие процессы.
- Backend job НЕ ставит fronend-инструменты; e2e job НЕ запускает pytest. Job'ы независимы.
