# Тесты

В репо два уровня тестов. Оба — исполняемая документация: имя теста читается как
спецификация, тело — как пример «что должно произойти».

## Сводка

| Уровень | Где | Технология | Скорость |
|---|---|---|---|
| Backend service + WS | `backend/tests/` | pytest + FastAPI TestClient | 213 тестов (125 Planning Poker + 88 Retro Board), <0.1s |
| Frontend e2e | `frontend/tests/e2e/` | Playwright + Chromium | 69 тестов (50 Planning Poker + 19 Retro Board), ~1.5 мин |

## Backend (pytest)

```bash
cd backend
source .venv/bin/activate
pip install -r requirements-dev.txt   # один раз
pytest                                # все 213 тестов
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
| `test_retro_boards_and_participants.py` | Retro Board (issue #62) — создание доски по каждому из 3 шаблонов, facilitator-handoff, join/kick/close, disconnect grace, обновление ника/цвета | 24 |
| `test_retro_cards_voting_timer.py` | Retro Board — add/edit/delete карточек с permission-проверками (автор/фасилитатор/чужой), vote/unvote с enforced бюджетом, `update_board` (rename, anonymous_mode, лимит голосов), полный жизненный цикл таймера | 27 |
| `test_retro_websocket.py` | Retro Board — REST bootstrap, WS auto-join/reconnect, `board_inactive`, broadcast карточек, error-пути, таймер по WS, kick + `board_closed`, group_cards/react_to_card broadcast | 18 |
| `test_retro_grouping_and_reactions.py` | Retro Board (issue #62 Phase 2) — group_cards (drag-a-child moves only that card, drag-a-head carries its children, cross-column rejection, resolve-to-head), ungroup_card (child vs head dissolve), delete_card promotes first child as new head, react_to_card relay + validation | 19 |

Бизнес-правила Retro Board — в `docs/RETRO_BUSINESS_LOGIC.md`.

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
| `home.spec.ts` | Issue #22 — форма создания комнаты (`/new`) рендерится; create-game с пустым именем показывает ошибку, не навигирует |
| `landing.spec.ts` | Issue #22 — лендинг на `/`: hero/«как это работает»/«фичи» рендерятся; CTA-кнопка ведёт на `/new`; nav-ссылки header'а (FAQ, Create a room) ведут на `/faq` и `/new` |
| `faq.spec.ts` | Issue #22 — `/faq` рендерится, все 6 вопросов на месте; `<details>` разворачивается по клику на `<summary>` |
| `create-and-vote.spec.ts` | Фасилитатор создаёт комнату → голосует → «Reveal cards» появляется |
| `reveal-and-stats.spec.ts` | Голосует → Reveal → «Average» + «New round»; New round сбрасывает |
| `two-players.spec.ts` | Два контекста (две сессии) в одной комнате → видят друг друга → оба голосуют → reveal на одном → обе видят stats |
| `mobile-flows.spec.ts` | Issue #23 — те же 5 ключевых флоу на viewport 375×667 (iPhone SE) с `hasTouch: true`: создание комнаты + join по ссылке, голос+reveal, Game Settings (проверка что Save помещается в viewport), issues-drawer (добавить+выбрать issue), рисование пальцем через синтетические `TouchEvent`; + два регрессионных теста, которые кликают конкретное значение в `EstimatePicker`/`RevotePicker` на мобиле и проверяют что оно **реально применилось** (не просто что модалка открылась) — см. `docs/BUSINESS_LOGIC.md` раздел «Баг: выбор в мобильной модалке не применялся» |
| `throw-reaction.spec.ts` | Issue #51 — эмодзи-часть бара скрыта пока `fun_features_enabled=false`, но kick у фасилитатора работает всегда; включение тумблера в Game Settings → hover на чужой карточке → клик по дефолтному эмодзи → `throw-floater` появляется у ОБОИХ клиентов и исчезает по истечении lifetime; `+`-пикер бросает доп. эмодзи и закрывается сам; kick по-прежнему работает из новой корзины в баре |
| `drawing-toggle-and-fade.spec.ts` | Toggle рисования по клику/ESC; штрих исчезает через ~5s; Issue #50 — вершина-«кончик» карандашного курсора рендерится строго на позиции мыши (`getBoundingClientRect` временного SVG-маркера), а «ластик» — выше и левее (наклон вправо, не строго вертикально) |
| `animations.spec.ts` | Issue #5 — UI-анимации: карта переворачивается (`card-flip`) ровно на момент `revealed: false→true` и класс снимается сам через ~400ms; новая карточка игрока получает `player-fade-in`; kick-нутый игрок рендерится ghost'ом с `player-fade-out` (`data-testid="player-card-ghost"`) и исчезает после анимации; stats-панель в центре стола получает `stats-slide-in` при reveal; issue-строки несут `data-issue-id` (нужен FLIP-хуку в `IssueSidebar.tsx`) и reorder («Move to top») по-прежнему меняет порядок |
| `retro-board.spec.ts` | Issue #62 (Phase 1) — создание доски + дефолтные колонки шаблона; два участника видят карточки/голоса друг друга живьём; vote-бюджет enforced по всем карточкам сразу (`max_votes_per_person`), unvote освобождает бюджет; автор редактирует/удаляет свою карточку; `anonymous_mode` скрывает имя автора у остальных, но не у самого автора; таймер start/pause/reset; kick участника → overlay `retro-inactive-overlay[data-reason=kicked]`; close board → overlay `[data-reason=closed]`; неизвестный board id → overlay `[data-reason=not_found]` |
| `retro-board-phase2.spec.ts` | Issue #62 (Phase 2) — drag (реальный `page.mouse`, не scripted `dispatchEvent`) одной карточки на другую показывает диалог подтверждения `"Merge these cards?"`, confirm сливает обе карточки в ОДНУ с `---`-разделителем (бейдж `🗂 N`); cancel оставляет обе карточки раздельными; drop в другую колонку не показывает диалог и не группирует (клиент отклоняет молча); добавление третьей карточки в существующий merge расширяет ту же карточку; кнопка undo (`retro-card-unmerge`) распускает merge обратно в отдельные карточки; голос, поставленный до merge, переживает unmerge (остаётся на той конкретной подкарточке, куда был реально записан); **регрессия**: drop смёрженной карточки сама на себя — no-op, а не full-page `"Something went wrong"`; card-reaction оверлей всплывает у ОБОИХ клиентов; **регрессия**: reaction-попап никогда не перекрывает текст карточки (geometric bounding-box check, не просто `toBeVisible()`); мобильный viewport (375×667, `hasTouch`) — ручка и триггер реакций видны без hover, голос и реакция работают через `tap()` |

### Helpers (`tests/e2e/helpers.ts`)

- `createRoom(page, gameName?, facilitatorNick?)` — `/new` → создать → ввести ник → ждать WS. (Issue #22 переместил форму создания комнаты с `/` на `/new` — `/` теперь лендинг.)
- `joinRoom(page, url, nickname, asSpectator?)` — открыть URL комнаты как другой пользователь.
- `voteCard(page, card, confirmRegex?)` — кликает карту с повторами, пока на странице не появится подтверждение (по умолчанию «All voted!»). Polling нужен потому что в коротком окне между HTTP-навигацией и WS-handshake первый клик может улететь в no-op (`send()` дропает сообщения, если ws.readyState !== OPEN).

### Helpers (`tests/e2e/retro-helpers.ts`)

- `createRetroBoard(page, boardName?, facilitatorNick?)` — `/retro/new` → создать → ввести ник → ждать WS. `waitForURL` явно исключает `/retro/new` из паттерна (`/\/retro\/(?!new$)[a-z0-9]+$/`) — без этого регэксп ложно матчит саму страницу создания (`new` проходит под `[a-z0-9]+`), и хелпер возвращал бы неправильный URL.
- `joinRetroBoard(page, boardUrl, nickname)` — открыть URL доски как другой участник.
- `addCard(page, columnTitle, text)` — находит колонку по заголовку, печатает текст, жмёт Enter, ждёт появления карточки.
- `dragCardOnto(page, sourceText, targetText)` (issue #62 Phase 2) — измеряет `boundingBox()` ручки исходной карточки и центра целевой, затем `page.mouse.move/down/move/up`. Важно: используется настоящий `page.mouse`, а не `locator.dispatchEvent("touchstart", ...)` — синтетически диспатченные touch-события НЕ транслируются браузером в `PointerEvent` так, как это делает реальный аппаратный тач, а drag-логика (`useRetroCardDrag`) слушает именно Pointer Events. `page.mouse` управляет браузером через настоящий CDP-инпут, который Chromium честно транслирует в `pointerdown`/`pointermove`/`pointerup`, поэтому воспроизводит тот же путь, что и реальная мышь/палец.

### Мобильные тесты и ловушка с `.first()` (issue #23)

`PokerTable` теперь один и тот же компонент на всех брейкпоинтах (см. `docs/BUSINESS_LOGIC.md` → «Стол теперь один и тот же на всех размерах экрана») — раньше ниже `md` в DOM одновременно присутствовали **обе** копии стола (десктопный `PokerTable` + мобильный `ActionBox`-fallback, одна всегда `display:none`), и это было основным источником ловушки ниже. Та дублирующая пара исчезла, но тот же паттерн остался в `EstimatePicker` (`IssueSidebar.tsx`) и `RevotePicker` (`RoomPage.tsx`) — у обоих мобильная модалка и десктопный дропдаун смонтированы одновременно как два разных элемента, CSS прячет только один.

`mobile-flows.spec.ts` поэтому не переиспользует `voteCard`/текстовые локаторы 1-в-1 из десктопных тестов там, где они матчат что-то внутри этих пикеров: Locator по тексту/роли матчит обе копии, и `.first()` берёт первую **в DOM-порядке**, а не первую видимую — на мобильном viewport'е это чаще всего скрытая desktop-копия, и `expect(...).toBeVisible()` зависает до таймаута. Паттерн, которым это обходится в `mobile-flows.spec.ts`:

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
- Genuine touch-based drag-to-group на Retro Board (issue #62 Phase 2) — `retro-board-phase2.spec.ts` покрывает группировку через `page.mouse` (реальные Pointer Events), но не через настоящий hardware-touch drag; `mobile viewport` describe-блок в том же файле проверяет только что controls видны и voting работает через `tap()` на мобильном viewport'е, не сам drag

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
