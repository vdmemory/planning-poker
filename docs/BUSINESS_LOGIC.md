# Бизнес-логика

Документ описывает правила игры, права участников и конкретные эффекты каждого действия. Это контракт продукта — он живёт в `services.py`, и любые расхождения между этим документом и кодом — баг в одном из них.

## Сущности

### Room

| Поле | Тип | Что значит |
|---|---|---|
| `id` | string (10 hex) | уникальный идентификатор комнаты, используется в URL |
| `name` | string | человеко-читаемое название |
| `deck_type` | `fibonacci`\|`powers_of_2`\|`sequential`\|`tshirt` | колода голосования |
| `card_back` | string | визуальный стиль рубашки карты |
| `who_can_reveal` | `facilitator`\|`everyone` | кто может открывать карты и сбрасывать раунд |
| `who_can_manage_issues` | `facilitator`\|`everyone` | кто управляет списком задач |
| `close_on_facilitator_leave` | bool, дефолт `false` | issue #19 — если `true`, уход фасилитатора закрывает комнату для всех вместо передачи роли |
| `facilitator_id` | string\|null | id текущего фасилитатора |
| `players` | dict[id, Player] | участники |
| `issues` | list[Issue] | очередь задач |
| `current_issue_id` | string\|null | какая задача голосуется сейчас |
| `votes` | dict[player_id, card] | текущие голоса |
| `revealed` | bool | открыты ли карты в текущем раунде |

### Player

| Поле | Что значит |
|---|---|
| `id` | уникальный, переживает реконнект |
| `nickname` | отображаемое имя; меняется через `update_nickname` |
| `is_facilitator` | bool, ровно у одного игрока true |
| `is_spectator` | bool; зритель не может голосовать |
| `connected` | bool; false если потеряли коннект (отображается серым) |
| `disconnected_at` | timestamp потери коннекта; используется cleanup-задачей |
| `avatar_color` | hex; персональный цвет |

### Issue

| Поле | Что значит |
|---|---|
| `id` | uuid |
| `title` | заголовок |
| `description` | подробности (опционально) |
| `link` | URL на внешний тикет (опционально) |
| `final_estimate` | string\|null; итоговая оценка задачи |

## Роли

| Роль | Кто | Что может |
|---|---|---|
| **Facilitator** | Создатель комнаты, или первый из оставшихся при уходе предыдущего | Всё: настройки комнаты, kick, close, всегда reveal/reset, всегда issues |
| **Player** | Любой не-зритель не-фасилитатор | Голосовать (vote/revote), менять свой ник/цвет, переключаться в зрителя, рисовать |
| **Spectator** | Игрок с `is_spectator=true` | Видит всё, не может голосовать. Переключается сам, фасилитатор не может стать зрителем |

Права на конкретные действия — см. секцию «Жизненный цикл».

## Колоды

| Колода | Карты | Когда применять |
|---|---|---|
| `fibonacci` | 0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, ?, ☕ | дефолт; классика для story points |
| `powers_of_2` | 0, 1, 2, 4, 8, 16, 32, 64, ?, ☕ | если команда мыслит часами/днями с удвоением |
| `sequential` | 1...10, ?, ☕ | простые оценки от 1 до 10 |
| `tshirt` | XS, S, M, L, XL, XXL, ? | качественная оценка, без чисел |

`?` — «не знаю / нужно обсудить». `☕` — «нужен перерыв». Эти карты НЕ участвуют в average/median, но видны в `distribution`.

## Жизненный цикл раунда

```
[создание комнаты] → раунд 1 ──── reveal ──── reset ──── раунд 2 ──── ...
                       │             │
                       │             ├─ stats: avg, median, distribution, consensus
                       │             ├─ final_estimate = mode (самая частая карта)
                       │             └─ revote разрешён → пересчёт stats и final_estimate
                       │
                       └─ vote: каждый игрок выбирает карту, видим только список «кто голосовал»
```

### Создание комнаты

`POST /api/rooms` с `{name, deck_type, facilitator_nickname}`.
- Создаётся Room.
- Создаётся первый Player с `is_facilitator=true`. `facilitator_id = player.id`.
- В ответе: `room_id`, `player_id`, текущий `state`.

### Подключение к комнате

WebSocket `/ws/{room_id}?player_id=...&nickname=...`.
- Если `player_id` уже в комнате → реконнект (см. ниже).
- Если нет, но передан `nickname` → создаётся новый Player, `is_facilitator=false`.
- Если ни того, ни другого → соединение закрывается с кодом 4001.

Это даёт инвайт-ссылку «открыл → ввёл ник → играешь».

### Голосование (vote)

**Кто**: любой игрок, кроме зрителя.
**Когда**: до `reveal`.
**Что происходит**: `room.votes[player_id] = card`. Перезапись разрешена.
**Что видят остальные**: только факт, что игрок проголосовал (через `voted_player_ids`). Значение скрыто (`"hidden"`).
**Ошибки**:
- Если зритель → `Spectators cannot vote`.
- Если уже было `reveal` → `Voting closed: results already revealed` (нужно `reset` или `revote`).
- Если карта не из колоды → `Invalid card '{card}' for this deck`.

### Открытие карт (reveal)

**Кто**: зависит от `who_can_reveal`:
- `facilitator` (дефолт) → только фасилитатор.
- `everyone` → любой игрок в комнате.

**Что происходит**:
1. `room.revealed = true`.
2. Все значения голосов становятся видимыми.
3. Считается `stats` (average, median, distribution, consensus).
4. Если выбрана задача (`current_issue_id`) — `final_estimate` задачи автоматически проставляется как **mode** (самая частая карта). При равенстве выбирается лексикографически большая.

### Re-vote после открытия (revote)

**Кто**: любой не-зритель, после `reveal`.
**Что происходит**: голос обновляется, `stats` пересчитываются, `final_estimate` пересчитывается из нового mode.
**Зачем**: команда обсудила, кто-то поменял мнение — без полного сброса.

### Сброс раунда (reset)

**Кто**: то же, что `reveal` (по `who_can_reveal`).
**Что происходит**: `votes` очищается, `revealed = false`. `final_estimate` НЕ сбрасывается — оценка задачи сохраняется до явной перезаписи через `set_estimate` или при удалении задачи.

## Статистика

`compute_stats(room)` возвращает:

| Поле | Расчёт |
|---|---|
| `average` | mean численных карт, округлено до 2 знаков. None, если численных нет. |
| `median` | медиана численных карт. None, если численных нет. |
| `distribution` | словарь карта → количество. Все карты, включая `?`, `☕`, T-shirt. |
| `consensus` | true, если все голоса равны (и есть хоть один голос). |
| `total_votes` | количество проголосовавших. |

Численными считаются только карты, которые парсятся в `float`. `?`, `☕`, `XS..XXL` — не численные, не учитываются в average/median.

**Auto-final-estimate**: при `reveal` и `revote` задача автоматически получает `final_estimate = mode(distribution)`. Фасилитатор может перезаписать через `set_estimate`.

## Задачи (Issues)

Очередь задач — это backlog для голосования. По одной задаче за раунд.

### Создание (add_issue)

**Кто**: по `who_can_manage_issues`.
**Что происходит**:
- Создаётся `Issue` и добавляется в конец `issues`.
- Если `current_issue_id == null` (активной задачи нет), новая задача автоматически становится активной.

### Редактирование (update_issue, delete_issue, reorder_issue, delete_all_issues)

Все по `who_can_manage_issues`.

- **update**: меняет title/description/link.
- **delete**: удаляет задачу. Если удалили активную → активной становится первая в списке (или `null`, если список пуст). При удалении активной задачи `votes` и `revealed` сбрасываются.
- **delete_all**: вычищает список целиком, сбрасывает голоса и `revealed`, `current_issue_id = null`.
- **reorder**: меняет позицию задачи в списке. `direction = top|up|down|bottom`.

### Выбор активной задачи (select_issue)

**Кто**: по `who_can_manage_issues`.
**Что происходит**: `current_issue_id = issue_id`, `votes.clear()`, `revealed = false`. Это запускает новый раунд для другой задачи.

### Ручная оценка (set_estimate)

**Кто**: по `who_can_manage_issues`.
**Что происходит**: фасилитатор переопределяет `final_estimate` любой задачи (например, после обсуждения принял оценку, отличную от mode голосования).

## Настройки комнаты (update_room)

**Кто**: всегда только фасилитатор.

Меняются: `name`, `deck_type`, `card_back`, `who_can_reveal`, `who_can_manage_issues`, `close_on_facilitator_leave`, `fun_features_enabled`.

**Эффект смены `deck_type`**: голоса сбрасываются и `revealed = false` (старые карты могут быть невалидны в новой колоде).

## Действия игрока над собой

- **update_nickname**: меняет свой ник. Пустая строка игнорируется.
- **update_avatar_color**: меняет цвет аватара. На фронте также сохраняется в `localStorage` как `pp:avatar-color`.
- **toggle_spectator**: переключает свой режим. Фасилитатор **не может** стать зрителем (`Facilitator cannot be a spectator`). При переходе в зрителя свой голос вычищается.

## Модерация (фасилитатор)

### kick_player

Фасилитатор удаляет игрока. Эффекты:
1. Кикнутому игроку шлётся `{type: "kicked"}`, его WS закрывается с кодом 4003.
2. Фронт ловит типизированное сообщение и показывает overlay `roomInactive="kicked"` с копией «You were removed from this room» (issue #37). Реконнект отключается, чтобы Cloudflare-сценарий (где close-код приходит как 1005) не открыл WS заново и не вошёл по auto-join как новый игрок с тем же ником.
3. Игрок и его голос удаляются из комнаты.
4. Себя кикнуть нельзя.

### close_room

Фасилитатор закрывает комнату. Все клиенты получают `{type: "room_closed", reason: "creator_left"}`. Комната удаляется из store. Фронт показывает full-screen overlay «The room was closed by the creator» с кнопкой «Back to home» (это та же `roomInactive`-overlay что для expired/not_found, см. ниже).

### close_on_facilitator_leave (issue #19)

Опциональный режим, который фасилитатор включает в Game Settings (`update_room {close_on_facilitator_leave: true}`). Эффект:

- При **обычном** уходе фасилитатора (disconnect > 30s, cleanup задача удаляет игрока): если в комнате остались другие игроки и `close_on_facilitator_leave=true` → `remove_player` удаляет комнату и возвращает `True`. WS-слой ловит этот сигнал и шлёт `{type: "room_closed", reason: "creator_left"}` всем оставшимся клиентам, после чего закрывает их сокеты. Это re-using контракта `close_room` — на фронте та же overlay.
- При **выключенной** настройке (дефолт): сохраняется legacy-поведение — `remove_player` передаёт роль `facilitator` первому из оставшихся `players.values()` и возвращает `False`. Никакого broadcast'а `room_closed` не происходит.
- Если фасилитатор — **последний** игрок в комнате, комната всегда удаляется (как и раньше), но `remove_player` возвращает `False` — некому слать notify.
- Уход обычного игрока (`is_facilitator=false`) никогда не закрывает комнату, независимо от флага.

Тесты этого пути живут в `backend/tests/test_rooms_and_players.py` (7 кейсов, охватывают все ветки).

## Lifecycle комнаты и истечение таймера

Каждая комната живёт ограниченное время — по умолчанию **24 часа** с момента `create_room`. После этого она автоматически закрывается, даже если в ней есть активные игроки. Это страховка от «забытых» комнат, которые висели бы в памяти бесконечно.

| Поле | Описание |
|---|---|
| `Room.expires_at` | ISO datetime когда комната станет неактивной. Устанавливается при `create_room` как `now + services.ROOM_LIFETIME`. |
| `Room.is_expired(now)` | `True`, если текущее время ≥ `expires_at`. |
| `services.ROOM_LIFETIME` | Module-level constant, дефолт `timedelta(hours=24)`. В тестах monkeypatch'ится на короткое значение. |

### Что происходит когда таймер истёк

| Триггер | Эффект |
|---|---|
| Любой `RoomService.<action>` (`vote`, `reveal`, `add_issue`, и т.д.) | `get_room` сразу райзит `RoomError("Room {id} has expired")`. WS-роутер ловит и шлёт `{type: "error", message: "..."}` отправителю. |
| Background task `cleanup_expired_rooms` (каждые 60s) | На каждую expired-комнату broadcast'ит `{type: "room_expired", reason: "timer"}` всем подключённым клиентам, затем закрывает их WS (код 4005 локально, в проде Cloudflare сводит к 1005 — фронт ловит по типу сообщения). Удаляет комнату через `RoomService.expire_room`. |
| Новый WS-connect к expired-комнате (до того как cleanup отработал) | Сервер: `accept` → `send_json({type: "room_inactive", reason: "expired"})` → `close(code=4005)`. **Фронт реагирует на типизированное сообщение** — close-код опциональный. |
| Новый WS-connect к удалённой комнате (после cleanup) | То же что выше, только `reason: "not_found"` и close-код 4004. |
| REST `GET /api/rooms/{id}` для expired/удалённой комнаты | 404. Фронт это использует чтобы показать overlay «no longer active» без захода в WS. |

### UX на фронте

`useRoomSocket` выставляет `roomInactive: "expired" | "not_found" | "closed" | "kicked" | null`. Главный сигнал — **типизированное WS-сообщение**, не close-код:

| Источник | Значение |
|---|---|
| WS-сообщение `{type: "room_expired"}` (получено когда уже подключён) | `"expired"` |
| WS-сообщение `{type: "room_inactive", reason: "expired"}` (на connect) | `"expired"` |
| WS-сообщение `{type: "room_inactive", reason: "not_found"}` (на connect) | `"not_found"` |
| WS-сообщение `{type: "room_closed", reason: "creator_left"}` (issue #19) | `"closed"` |
| WS-сообщение `{type: "kicked"}` (issue #37) | `"kicked"` |
| WS close код 4005 (TestClient / локалка без Cloudflare) | `"expired"` |
| WS close код 4004 (TestClient / локалка без Cloudflare) | `"not_found"` |
| WS close код 4003 (TestClient / локалка без Cloudflare) | `"kicked"` (fallback, обычно типизированное сообщение приходит раньше) |
| Иначе | `null` |

При `roomInactive !== null` хук **выставляет `shouldReconnectRef.current = false`** — никаких повторных попыток. `RoomPage` рендерит full-screen overlay с одной из четырёх копий:

| `roomInactive` | Иконка | Заголовок | Когда показывается |
|---|---|---|---|
| `"expired"` | ⌛ | This room is no longer active | Истёк 24h-таймер |
| `"closed"` | 🚪 | The room was closed by the creator | Фасилитатор закрыл комнату (явно или через issue #19) |
| `"kicked"` | 👋 | You were removed from this room | Фасилитатор кикнул конкретно этого игрока (issue #37). Комната живёт дальше — overlay видит только кикнутый. |
| `"not_found"` | 🔗 | Room not found | Чужой/опечатанный URL |

Почему `kicked` отдельный, а не `closed`? Закрытие комнаты — общее событие для всех; кик — персональное. Для всех остальных в комнате после кика всё работает как раньше, поэтому копия «room is no longer available» была бы неточной. Под капотом — общий механизм (тот же `roomInactive` union, та же overlay, тот же reconnect-block), только заголовок/иконка отличаются.

### Дизайн-решения

- **Почему фиксированные 24h** (а не настройка фасилитатора)? Чтобы scope первой итерации остался MVP. Будущий issue может добавить per-room timer config в `update_room` (`expires_in_hours`).
- **Почему типизированное сообщение, а не custom close-код?** Render держит Cloudflare как edge proxy, и Cloudflare strip'ит коды close в диапазоне 4000-4999. На бэке мы делаем `close(code=4005)`, но в браузере приходит `event.code === 1005` («No Status Received»). Без явного сигнала фронт не отличил бы «комната неактивна» от обычного разрыва и крутил бы бесконечный reconnect. Поэтому контракт у нас — **типизированный `{type: "room_inactive", reason: "..."}` data-frame перед close**. Close-код мы всё равно шлём, но он живёт только для unit-тестов и локальной разработки (где TestClient не идёт через Cloudflare).
- **Почему `reason: "expired"` vs `"not_found"`?** Разная text-ка на overlay: «timer expired» имеет смысл только если комната когда-то была. Иначе пользователь думает «комната исчезла», тогда как реально он ткнул в чужой/опечатанный URL.
- **Почему accept перед close?** Браузерный WebSocket API не доставляет ни close-код, ни данные если server-side close произошёл до `accept()` — handshake не завершился, всё видно как code 1006 (abnormal). Сначала accept → потом send + close — guaranteed delivery message-frame'а.

## Реконнект и потери связи

| Событие | Эффект |
|---|---|
| Игрок теряет коннект | `connected=false`, `disconnected_at=now`. В UI становится серым с пометкой «offline». Голос сохраняется. |
| Возвращается до 30s | `connect=true`, `disconnected_at=null`. Ник может обновиться. |
| Не вернулся 30s | Cleanup-задача удаляет. Если это был фасилитатор и в комнате включён `close_on_facilitator_leave` — комната закрывается для всех (см. секцию `close_on_facilitator_leave` выше). Иначе legacy-поведение: роль переходит первому из `players.values()`. Если в комнате никого — комната удаляется. |
| Page refresh | `player_id` из `localStorage` → реконнект как тот же игрок без потери голоса/прав. |

## Drawing и курсоры (вспомогательная фича)

Сообщения `draw_stroke`, `draw_cursor`, `draw_clear` **не модифицируют состояние комнаты** — они релеятся всем участникам кроме отправителя (`broadcast_except`). Это позволяет рисовать поверх стола и видеть курсоры друг друга в реальном времени без перерасхода на store.

При дисконнекте игрока — отправляется `draw_clear` с его `player_id`, чтобы убрать его курсор/штрихи у остальных.

### Lifetime штрихов (issue #3)

Завершённые штрихи (с `done: true` в `draw_stroke`) живут на canvas'е **5 секунд**, потом fade-out последнюю секунду и удаляются. Это чисто фронтовое поведение — backend ничего не знает про таймер, он только релеит сообщение. Текущие in-progress штрихи (рисующиеся прямо сейчас) НЕ фейдятся — только завершённые. Курсоры не затрагиваются.

Константы в `frontend/src/components/DrawingCanvas.tsx`:
- `STROKE_LIFETIME_MS = 5000` — общее время жизни штриха
- `STROKE_FADE_OUT_MS = 1000` — последняя секунда из жизни идёт линейный fade

Реализация — в render-цикле: для каждого штриха считается `age = now - startedAt`, alpha вычисляется по формуле, штрихи старше lifetime фильтруются. Цикл рендера непрерывно тикает пока есть хоть один completed-штрих (чтобы fade был плавным).

### Drawing mode UI (issue #6)

В header'е комнаты есть кнопка с иконкой карандаша. Поведение:
- **Click по карандашу** → toggle режима рисования. Один клик включает, повторный — выключает. Используется текущий выбранный цвет.
- **Маленькая swatch-кнопка** справа от карандаша → открывает color picker для смены цвета. Можно открывать/закрывать когда угодно (в режиме рисования или нет).
- **ESC** → выходит из режима рисования (как раньше; работает параллельно с кликом).

Состояние режима **локальное** (`useState` в `RoomPage.tsx`), не шарится через WS. Когда выходишь — отправляется `draw_clear` чтобы убрать свои штрихи у других, но фейд они получают и без этого.

## Подтверждение деструктивных действий (issue #4)

Все четыре destructive-флоу используют единый компонент `ConfirmModal` (`frontend/src/components/ConfirmModal.tsx`) вместо нативного `confirm()`:

| Триггер | Title | Confirm button | Подтверждение приводит к |
|---|---|---|---|
| Delete one issue (kebab → Delete) | `Delete this issue?` + название | `Delete` | WS `delete_issue` |
| Delete all issues (bulk-меню) | `Delete all issues?` + счёт | `Delete` | WS `delete_all_issues` |
| Close room (Profile menu → Close room for everyone) | `Close room for everyone?` | `Close room` | WS `close_room` |
| Kick player (hover-X на чужой карточке, только facilitator) | `Remove {nickname} from the room?` | `Remove` | WS `kick_player` |

Поведение модалки:
- Confirm-кнопка autofocus'ит (Enter подтверждает); destructive variant — красная.
- ESC закрывает (cancel).
- Клик по backdrop'у — cancel.
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` — для скринридеров.
- `data-testid="confirm-modal"`, `confirm-modal-confirm`, `confirm-modal-cancel`, `confirm-modal-backdrop` — для e2e.

Старый bespoke компонент `CloseRoomModal` удалён — заменён общим ConfirmModal.

Kick раньше срабатывал моментально (одиночный клик по X). Теперь — двухшаговое подтверждение, чтобы случайный клик не выкидывал коллегу из комнаты.

## Reactions (issue #32)

Google Meet-style quick reactions: участник кликает на эмодзи или time-значение → у всех (включая отправителя) видны два эффекта:
1. Маленькая иконка/лейбл всплывает над **карточкой того, кто кликнул** на ~3 сек.
2. В **нижнем-левом углу** экрана появляется большой floater — иконка + плашка с именем — поднимается вверх и затухает за ~3.5 сек.

### WS-протокол

| Сторона | Сообщение |
|---|---|
| Client → Server | `{ type: "reaction", kind: "emoji" \| "number", value }` |
| Server → All clients (sender included) | `{ type: "reaction", player_id, nickname, avatar_color, kind, value }` |

Не хранится в `Room` — pure relay, как `countdown`/`draw_*`. Сервер обогащает сообщение `nickname`/`avatar_color` отправителя, чтобы получателям не нужно было держать карту игроков синхронной.

### Наборы значений

Конфигурируются в `frontend/src/components/ReactionsPanel.tsx`:
- **Emoji**: `💖 👍 👏 🎉 🔥 😂 😮 🤔 😢 👎` (10 шт.). Порядок: love/approval → celebration/hype → laughter/surprise/think → sad/dislike.
- **Number** (time-values): `1h 2h 3h 4h 5h 6h 1d 12h 2d 3d` (10 шт.). Часовая шкала идёт линейно до 6h; дальше `1d` стоит перед `12h`, потому что «день» — самая ходовая фишка в planning poker, и её удобнее иметь в один тап.

Переключение режимов — toggle на самой панели, локальный state, не шарится.

### Анимированные эмоджи

Каждый emoji-флоатер рендерит **Lottie**-анимацию из `frontend/public/reactions-lottie/<codepoint>.json`. Источник ассетов — [Google Noto Animated Emoji](https://googlefonts.github.io/noto-emoji-animation/) (Apache 2.0): векторные, с настоящим alpha-каналом, поэтому на тёмной теме нет белой подложки вокруг эмоджи (как было у предыдущей MP4-реализации).

Маппинг живёт в `REACTION_EMOJI_LOTTIE` рядом со списком эмоджи. Если для эмоджи нет файла (peer на старой сборке прислал не-маппленную реакцию), флоатер fallback'ится на текстовый глиф — UX мягко деградирует. Time-values никогда не идут через Lottie — это лейблы-пилюли.

#### Реализация

- `lottie-react` подгружается через `React.lazy()` — основной бандл остаётся ~83 KB gz, lottie-web (~82 KB gz) идёт отдельным chunk'ом.
- **Issue #43 — eager preload**: при mount'е `ReactionsPanel` (то есть при заходе в комнату) `useEffect` сразу запускает:
  1. `import("lottie-react")` — прогрев chunk'а через Vite.
  2. `preloadAllReactionLottie()` — параллельный fetch всех 10 JSON-файлов в shared cache (`frontend/src/components/reaction-lottie-cache.ts`).

  К моменту первого клика по эмоджи и chunk, и JSON уже в памяти — флоатер рендерится в первый же кадр без сетевой задержки. На холодном кэше DevTools'у видна серия параллельных запросов `/reactions-lottie/*.json` сразу после mount'а, до любого клика.
- Cache живёт в module-level `Map`'е (`getCachedLottie` / `preloadLottie` / `preloadAllReactionLottie` экспортируются из `reaction-lottie-cache.ts`). Переход между комнатами в рамках SPA-сессии — попадание; полная перезагрузка — попадание через HTTP-cache браузера.
- Fallback path: если preload-fetch упал (404, offline), `ReactionFloater` на mount пытается live-fetch — без preload'а сценарий деградирует к старому «загружаем при клике» поведению, а не к пустому квадрату.
- Размер контейнера 72×72 px зарезервирован до подгрузки JSON, чтобы лента флоатеров не дёргалась при первом запуске.

Overlay над карточкой остаётся текстовым эмоджи — он маленький и эфемерный, Lottie там было бы избыточно.

### Lane allocation для floater'ов

Чтобы реакции от разных игроков не накладывались друг на друга, в нижне-левой зоне есть 5 «полос» (lanes) шириной 72px каждая. При новой реакции хук `useReactionAnimations`:
1. Ищет первую полосу, чей предыдущий floater уже истёк (Date.now > expiresAt).
2. Если все заняты — берёт ту, что освободится первой (oldest expiry).

Floater живёт `REACTION_FLOATER_MS = 3500ms`, overlay над карточкой — `REACTION_OVERLAY_MS = 3000ms`.

### Throttle

На клиенте не больше **1 реакции каждые 600 мс** (`REACTION_THROTTLE_MS = 600`). Лишние клики молча игнорируются — никаких баннеров/ошибок. Окно подобрано так, чтобы дать пользователю быстро «накидать» эмодзи в обсуждении, но не превратить экран в спам-парад.

### Mobile

На узких экранах (< md = 768px) панель сворачивается в одну кнопку 😀 в header'е → клик открывает **центрированную модалку** (issue #23 follow-up — раньше был bottom-sheet, но это ломало консистентность с остальными мобильными диалогами приложения, которые все центрированы) с тем же содержимым, крестиком-закрытием и затемнённым backdrop'ом. Клик по выбору закрывает модалку автоматически.

### Доступность

Каждая кнопка — `aria-label="React with {value}"`, toggle-кнопки режима — `role="tab"` с `aria-selected`. Скринридер прочитает «React with 👍», «React with 4h» и т.д.

## Throw reactions (issue #51)

Отдельная от Reactions (#32) фича: вместо реакции на **себя**, игрок кидает эмодзи в **конкретную чужую карточку** — hover (или тап на мобиле) по карточке другого игрока показывает панель, клик по эмодзи анимированно летит от карточки бросающего к карточке цели, у всех клиентов одновременно.

Изначально был мёртвый переключатель «Enable fun features» в Game Settings с описанием-заглушкой («Allow players throw projectiles to each other in this game»), который ничего не делал (issue #51 сначала просил его вырезать). Вместо удаления — реализован по-настоящему.

### Room-wide toggle, а не локальный pref

`fun_features_enabled` — поле на `Room` (не `GameSettings`/`localStorage`, в отличие от `autoReveal`), меняется через `update_room` **только фасилитатором**, приходит всем в `room_state`. Так и должно быть: «разрешить кидаться эмодзи» — это политика комнаты («in this game»), а не персональная настройка одного браузера.

По умолчанию `false` — существующие комнаты не меняют поведения.

### WS-протокол

| Сторона | Сообщение |
|---|---|
| Client → Server | `{ type: "throw_reaction", target_player_id, value }` |
| Server → All clients (sender included) | `{ type: "thrown_reaction", from_player_id, from_nickname, from_avatar_color, target_player_id, value }` |

Как и `reaction`/`draw_*`/`countdown` — pure relay, ничего не пишется в `Room`. `RoomService.throw_reaction` валидирует: `fun_features_enabled` включен (иначе `RoomError("Fun features are disabled in this room")`), отправитель и цель существуют в комнате, `value` не пустой.

### Hover-бар на карточке (`ThrowReactionBar`)

Заменил старый вечно-hover-appearing крестик (issue #23) на панель: 4 дефолтных эмодзи (`🎯 ✈️ 🧻 ❤️`) + кнопка `+` (открывает грид из 10 дополнительных: `🍅 🥚 💩 🔥 😂 👏 😱 🙌 👋 💯` — отдельная от «эмоций» палитры Reactions, тема «кидаться чем попало») + (только у фасилитатора) корзина для kick.

Важно: **эмодзи-часть** бара гейтится `fun_features_enabled`, а **kick остаётся доступен всегда**, независимо от тумблера — модерация не должна зависеть от «весёлых фич». Если `fun_features_enabled=false`, у фасилитатора в баре — только корзина (по сути тот же старый крестик, просто в новой обёртке); у остальных при наведении на чужую карточку не показывается ничего.

Видимость бара — тот же паттерн, что был у крестика: `opacity-100` по умолчанию (всегда видно на тачскрине, где нет hover), `[@media(hover:hover)]:opacity-0` + `group-hover:opacity-100` на устройствах с настоящим указателем. На своей собственной карточке бар не показывается (`!isMe`).

### Анимация полёта (`useThrowReactions` + `ThrowFloater`)

При получении `thrown_reaction`:
1. Хук ищет DOM-узлы отправителя и цели через `document.querySelector('[data-player-id="..."]')` (атрибут добавлен на корневой `div` `PlayerCard`) и берёт их `getBoundingClientRect()` **один раз**, в момент броска.
2. Если карточка цели не отрендерена у этого клиента — реакция тихо игнорируется (нечего анимировать).
3. Если карточка отправителя не найдена (редкий кейс — отключился в момент полёта) — точка старта падает на нижний край экрана по центру, а не на всю анимацию целиком.

`ThrowFloater` использует FLIP-технику: рендерится в стартовой точке, на следующий кадр (`requestAnimationFrame`) применяется `transform: translate(dx, dy) rotate(...)` с CSS-`transition` — браузер анимирует между двумя состояниями без JS per-frame и без сторонних библиотек. После приземления (по таймеру, не по `transitionend`, чтобы не зависеть от точного тайминга) — короткий bounce-keyframe (`throw-reaction-land` в `index.css`) на **внутреннем** `<span>` (у него свой `transform`, не конфликтует с translate/rotate внешнего `div`), после чего элемент угасает и хук снимает флайт по таймауту (`FLIGHT_LIFETIME_MS = 1500`).

Небольшой случайный сдвиг точки приземления (`landOffsetX/Y`, ±15/±12px) считается локально на каждом клиенте отдельно — чисто декоративно, не нужно синхронизировать по сети, чтобы несколько одновременных бросков в одну карточку не легли пиксель-в-пиксель.

## Countdown

Сообщение `{type: "countdown", seconds: 3}` релеется всем как есть — клиенты сами показывают анимацию обратного отсчёта перед `reveal`. Никакого серверного таймера или валидации.

## Public state (что видит клиент)

`Room.public_state()` возвращает клиенту:

```ts
{
  id, name, deck_type, card_back,
  who_can_reveal, who_can_manage_issues, fun_features_enabled,
  deck: string[],                   // карты текущей колоды
  facilitator_id,
  players: Player[],
  issues: Issue[],
  current_issue_id,
  votes: { [player_id]: card | "hidden" },   // "hidden" пока !revealed
  voted_player_ids: string[],                // факт голосования всегда виден
  revealed: bool,
  expires_at: string,                        // ISO datetime — см. "Lifecycle комнаты"
}
```

`stats` приходит отдельным полем рядом с `state` только в `room_state` после `reveal`/`revote`.

## Темы и акценты (issue #42)

Два независимых axis, оба фронтовые, оба персональные (никогда не шарятся через WS):

| Axis | Значения | Что меняет | Куда пишется |
|---|---|---|---|
| **Mode** | `light` \| `dark` \| `system` | Нейтральные цвета: `--c-bg`, `--c-panel`, `--c-panel2`, `--c-border`, `--c-text`, `--c-muted` | `localStorage["pp:theme"]` + class `light` на `<html>` |
| **Accent** | `blue` (default) \| `green` \| `red` \| `purple` \| `yellow` \| `orange` \| `teal` | Брендовые цвета: `--c-accent`, `--c-accent-hover`, `--c-accent-text`, `--c-accent-soft`, `--c-accent-soft-hi`, `--c-accent-fg` | `localStorage["pp:accent"]` + `data-accent="..."` на `<html>` |

Под капотом — всё через CSS переменные. Mode переключает класс, accent — атрибут. Сменa любого из них **не вызывает React re-render** ничего, кроме самого ProfileMenu — каскад делает всё бесплатно.

### Применение до первого рендера

`main.tsx` читает оба значения из localStorage и проставляет class/attribute на `<html>` **до** монтирования React tree, чтобы избежать «flash of default theme». Невалидное значение (например подделанный localStorage) игнорируется — fallback к дефолту, не ломаемся.

```ts
// main.tsx (упрощённо)
if (localStorage.getItem("pp:theme") === "light") html.classList.add("light");

const accent = localStorage.getItem("pp:accent");
if (accent && ALLOWED.has(accent)) html.setAttribute("data-accent", accent);
// default "blue" leaves attribute off so `:root` selectors win
```

### Палитра по комбинациям

Все 14 комбинаций (`light` × 7 + `dark` × 7) подобраны вручную в `frontend/src/index.css`:

- На **dark** mode большинство акцентов берут палитру Tailwind ~`500` для primary и `400` для hover/text — лучше читаются на тёмном фоне.
- На **light** mode те же палитры опускаются до `600/700` — для контраста с белыми панелями.
- **Yellow** — спецслучай: white-on-yellow даёт контраст ~2:1 (fail WCAG AA). На **dark yellow** `--c-accent-fg` = `#0f172a` (slate-900) — кнопки получают тёмный текст. На **light yellow** primary опускается до `#ca8a04` (yellow-700), белый текст на нём ≈ 4.5:1 — bold ОК.
- **Orange dark** — белый текст на `#f97316` ≈ 3:1, borderline для крупных кнопок. На light переходим к `#ea580c` где контраст лучше.

### Маппинг переменных на компоненты

| Переменная | Где используется |
|---|---|
| `--c-accent` (`bg-accent`, `border-accent`) | Primary кнопки (Create game, Save, Continue, Reveal), активные tab'ы, selected state карт голосования, focus border у inputs |
| `--c-accent-hover` (`hover:bg-accent-hover`) | Hover на primary кнопках |
| `--c-accent-text` (`text-accent`) | Brand-coloured text на neutral bg: ссылки, мелкие checkmark-иконки, hover на edit-name кнопках |
| `--c-accent-soft` (`bg-accent-soft`) | ~10–15% alpha — outline кнопки (Invite players), badge'и активного issue |
| `--c-accent-soft-hi` (`bg-accent-soft-hi`) | ~25–40% alpha — borders, ring у focus, shadow voting card'а при выборе |
| `--c-accent-fg` (`text-accent-fg`) | Текст НА accent bg — обычно белый, для yellow tema переключается на slate-900 |

### Что НЕ accent

- Семантические цвета (kick = red, success = green, warning = yellow, drawing цвета) остаются Tailwind-классами `red-500`, `yellow-500` и т.д. — они не меняются при смене акцента, потому что означают **смысл**, а не **бренд**.
- Avatar colors игрока (8 вариантов) — независимы, выбираются в ProfileMenu отдельной полоской.
- Poker felt (зелёный) — semantic, всегда зелёный.

## Mobile UX (issue #23)

### Стол теперь один и тот же на всех размерах экрана (issue #23 follow-up)

Изначально `RoomPage.tsx` рендерил **два параллельных layout'а** для стола: `PokerTable` (овальный стол, `hidden md:flex`) и мобильный fallback — `ActionBox` + `flex-wrap` список `PlayerCard` (`md:hidden`). `ActionBox` появился потому, что все размеры `PokerTable` были захардкожены в пикселях под десктоп — 520px-широкий фетл сам по себе не влезал в экран телефона.

Теперь `PokerTable` рендерится **один раз**, на любом брейкпоинте, а его пиксельные размеры масштабируются через `useIsMobile()` (`frontend/src/hooks/useIsMobile.ts` — `window.matchMedia('(max-width: 767px)')`, синхронизирован с Tailwind-брейкпоинтом `md`). `ActionBox` удалён вместе с дублирующим списком `PlayerCard'ов`.

Важный нюанс масштабирования: на десктопе фетл (`TW`/`TH`) в 5-8 раз больше карточки игрока (`PW`/`PH`), поэтому единый отступ `GAP` от края фетла до центра карточки надёжно перекрывает обе оси. Уменьшая фетл под мобилу без пропорционального уменьшения карточки, это соотношение переворачивается — карточка сверху стола становится **выше самого фетла**. Единый маленький `GAP` (чтобы стол влезал по ширине) в этом случае давал карточкам заезжать на текст в центре фетла по вертикали. Поэтому `GAP` расщеплён на `GAP_X`/`GAP_Y`, каждый считается отдельно от своей половины карточки (`PW/2`/`PH/2` + запас на глаз), а не от общего захардкоженного числа.

`TableCenter` (average/consensus/reveal-кнопки в центре фетла) использует обычные Tailwind `md:`-классы для размера текста — в отличие от геометрии стола, тексту не нужна точная пиксельная математика, чтобы стать компактнее на маленьком экране.

Так как `PlayerCard` теперь рендерится один раз (а не дважды, скрыто/видимо через CSS), гоча с `:visible`-фильтрацией в e2e-тестах для локаторов внутри стола (`player-name-pill`, `player-card`) **больше не актуальна** — она всё ещё нужна для `EstimatePicker`/`RevotePicker`, у которых мобильная модалка и десктопный дропдаун — по-прежнему два разных смонтированных элемента (см. разделы ниже).

### Issues drawer

`IssueSidebar` рендерится в одном и том же компоненте на всех размерах экрана, но контейнер вокруг него разный:
- **Мобильный (`< md`)**: `fixed inset-y-0 right-0` full-height overlay шириной `85vw` (max `max-w-sm`), выезжает поверх экрана справа, с полупрозрачным backdrop (`fixed inset-0 bg-black/50`, tap — закрывает). До issue #23 это был инлайн `w-72` элемент в общем `flex` ряду, который на узких экранах сжимал `main` до узкой полоски.
- **Десктоп (`md+`)**: как раньше — инлайн-панель `w-80 border-l` в общем flex-ряду, без backdrop.

Кнопка-триггер (`title="Toggle issues sidebar"`) в хедере одна на все размеры экрана.

### Touch-рисование

`DrawingCanvas` обрабатывает `touchstart`/`touchmove`/`touchend`/`touchcancel` наравне с `mousedown`/`mousemove`/`mouseup` — оба пути ведут в общие `startStroke`/`moveStroke`/`endStroke`, разница только во входных координатах (`e.touches[0]` vs `e.clientX/Y`). Пока `isActive`, канвас получает `touch-action: none`, чтобы браузер не перехватывал жест под скролл/pinch-zoom страницы — это снимает необходимость в `preventDefault()` внутри обработчика (что потребовало бы non-passive listener, React по умолчанию вешает touch-обработчики как passive).

### Kick-кнопка на тачскринах

Кнопка удаления игрока (facilitator-only) была `opacity-0 group-hover:opacity-100` — на тачскрине нет hover-состояния, кнопка была недостижима. Теперь она видна всегда (`opacity-100`) и только на устройствах с настоящим hover (`@media (hover: hover)` через Tailwind arbitrary variant `[@media(hover:hover)]:opacity-0` + `[@media(hover:hover)]:group-hover:opacity-100`) скрывается до наведения. Это не breakpoint-based (`sm:`/`md:`), а capability-based — планшет с мышью всё равно получит hover-поведение.

### Game Settings на коротких viewport'ах

Модалка `GameSettingsModal` раньше ограничивала высотой (`max-h-[70vh]`) только внутренний скролл-контейнер, а сама модалка не имела верхнего предела — на коротком viewport (iPhone SE, 667px) или с открытой iOS-клавиатурой шапка+тело+футер могли не поместиться, и кнопка Save уезжала за экран. Теперь вся модалка — `flex flex-col max-h-[90dvh]`: шапка и футер (`shrink-0`) зафиксированы, тело — `flex-1 min-h-0 overflow-y-auto`. `dvh` (dynamic viewport height), а не `vh`, учитывает схлопывание адресной строки/клавиатуры на мобильных браузерах.

### Размер карт

Карточки голосования и карточки игроков (`VotingCard`, `PlayerCard`, revote picker) — `w-12 h-16 sm:w-14 sm:h-20` вместо фиксированного `w-14 h-20`, чтобы на самых узких экранах (< 640px) ряд карт не переносился криво.

### Profile menu на мобиле (issue #23 follow-up)

`ProfileMenu` (тема, акцент, аватар, spectator-toggle, leave/close room) была `absolute right-0 top-full` дропдауном, заякоренным под кнопкой аватара — на узком экране ей физически некуда было раскрыться. Теперь один и тот же JSX-дерево рендерится в двух позиционных режимах через responsive-классы на обёртке:
- **`< md`**: обёртка — `fixed inset-0 flex items-center justify-center bg-black/60` (центрированная модалка, тот же визуальный язык что и `GameSettingsModal`), с заголовком «Profile» + крестиком-закрытием.
- **`md+`**: обёртка — `absolute right-0 top-full mt-2` (старый дропдорн-режим, без заголовка/крестика — закрытие только по клику вне).

Оба режима закрываются одним и тем же `mousedown`-listener на `document`, который проверяет «клик вне `menuRef`» — не нужно отдельно обрабатывать тап по backdrop'у на мобиле, тот же чек это уже покрывает.

### Estimate picker: мобильная модалка без прыжка, десктопный дропдаун без изменений (issue #23 follow-up)

Пикер оценки в `IssueSidebar.tsx` (кнопка с текущей оценкой на карточке issue) на **десктопе** — fixed-position дропдаун: измеряет `getBoundingClientRect()` кнопки-триггера в `useEffect` **после** первого рендера и проставляет `position: fixed` через `style` state (флип вверх/вниз в зависимости от места). Эта логика не трогалась — на десктопе дропдауну есть где открыться рядом с кнопкой, ничего никуда не прыгает.

На **мобиле** та же самая измеряемая позиция, наложенная на маленький экран, физически не помещалась и на первый кадр показывала пикер unpositioned (`style={}`) прямо в потоке документа, а затем дёргала его в вычисленную позицию — заметный «прыжок» при первом открытии. Поэтому для `< md` рядом с тем же самым (одним) `btnRef`-триггером рендерится второй вариант — центрированная модалка без каких-либо измерений (`fixed inset-0 flex items-center justify-center bg-black/50`). Оба варианта (`md:hidden` модалка / `hidden md:block` дропдаун) смонтированы одновременно и переключаются CSS-брейкпоинтом — тот же приём, что и `PokerTable`/`ActionBox` в `RoomPage.tsx` (см. вводный абзац этого раздела).

### Revote picker: та же mobile/desktop-развилка (issue #23 follow-up)

`RevotePicker` в `RoomPage.tsx` (карандаш на своей карточке игрока после reveal → смена голоса) исторически был центрированной full-screen модалкой **на всех размерах экрана** — в отличие от estimate picker'а выше, у него никогда не было отдельного десктопного дропдауна, который можно было бы «вернуть». Ради консистентности со всеми остальными пикерами получил тот же mobile/desktop-сплит с нуля:

- **`< md`**: без изменений — центрированная модалка (`fixed inset-0 flex items-center justify-center bg-black/50`).
- **`md+`**: новый fixed-position дропдаун, заякоренный на кнопку-карандаш. Так как карандаш рендерится в `PlayerCard`, а `RevotePicker` — соседний компонент, `PlayerCard` заводит `editBtnRef` и прокидывает его в `RevotePicker` пропом `triggerRef`, чтобы можно было измерить `getBoundingClientRect()` кнопки, а не элемента внутри самого пикера (как в estimate picker'е, где кнопка и пикер — часть одного компонента).

Обе версии смонтированы одновременно (`md:hidden` / `hidden md:block`), общий `open`-стейт (`showPicker` в `PlayerCard`) один на оба варианта.

### Баг: выбор в мобильной модалке не применялся (issue #23 follow-up, регрессия)

Обе модалки (`EstimatePicker` и `RevotePicker`) закрываются по клику вне себя через `document`-listener на `mousedown` — это нужно **только** десктопному дропдауну (у мобильной модалки уже есть свой backdrop с `onClick={onClose}` + `stopPropagation()` на контенте). Но так как мобильная модалка и десктопный дропдаун — это **два разных элемента** в DOM (переключаются классами `md:hidden` / `hidden md:block`, а не один и тот же элемент с responsive-классами, как в `ProfileMenu`), а `mousedown`-listener изначально проверял containment только по десктопному `ref`'у — на мобиле клик по ЛЮБОЙ кнопке значения внутри модалки (карточка деки, число оценки) читался как «клик снаружи» и вызывал `onClose()` на `mousedown`, на мгновение раньше, чем успевал сработать `onClick` той же кнопки с `onSelect(v)`. Из-за порядка событий (`mousedown` → `mouseup` → `click`) React успевал размонтировать модалку до наступления `click` — оценка/голос визуально «не менялись», хотя пикер закрывался, будто выбор случился.

Фикс — заводить **отдельный `ref` для мобильной модалки** (`mobileRef`) и проверять containment по обоим (`mobileRef` **и** десктопному `ref`) в одном `mousedown`-handler'е:

```ts
function handler(e: MouseEvent) {
  const target = e.target as Node;
  const insideMobile = mobileRef.current?.contains(target);
  const insideDesktop = desktopRef.current?.contains(target);
  if (!insideMobile && !insideDesktop) onClose();
}
```

Регрессионные тесты (обязательно кликают конкретное значение и проверяют что оно **реально применилось**, не просто что модалка открылась) — `tests/e2e/mobile-flows.spec.ts`: `estimate picker on mobile actually sets the estimate` и `revote picker on mobile actually changes the vote`.

### Что осталось design-decision'ом (issue #23, открытые вопросы)

- Отдельный nav/header паттерн (sticky bottom bar / hamburger) — не реализован, текущий хедер с иконками остаётся общим для всех размеров.
- Рисование поддерживает только один палец (`e.touches[0]`) — жестов мультитача/стилуса нет, для MVP этого достаточно.
