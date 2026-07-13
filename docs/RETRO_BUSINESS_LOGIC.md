# Retro Board — бизнес-логика (issue #62, Phase 1)

Второй независимый продукт на том же сайте — доска для ретроспектив. Отдельный домен: свои модели, store, сервис, WS-менеджер, WS-эндпоинт, REST-эндпоинты. Никакого общего кода с `Room`/`RoomService`, кроме domain-agnostic `ConnectionManager` (см. `docs/ARCHITECTURE.md`). Тот же гостевой, ephemeral, in-memory принцип, что и Planning Poker — никаких аккаунтов, истории досок или сохранения между рестартами бэка.

## Отличия от EasyRetro (сознательный scope-trim для MVP)

Issue #62 ссылался на EasyRetro как референс. Сайт был недоступен через сетевую политику агента (заблокирован proxy), поэтому план составлен по общеизвестной публичной бизнес-логике таких инструментов, не по прямому просмотру конкретной доски. Явные упрощения:

- Нет аккаунтов/команд/истории досок — только гостевой доступ по ссылке, как в Planning Poker.
- Голоса (карточки) видны всем сразу — никакого «reveal»/скрытия, в отличие от голосования в Planning Poker.
- Ручной drag-and-drop карточек между колонками отложен на Phase 2.
- Только 3 preset-шаблона колонок, без произвольных пользовательских колонок.

## Сущности

### RetroBoard

| Поле | Тип | Что значит |
|---|---|---|
| `id` | string (10 hex) | идентификатор доски, используется в URL |
| `name` | string | название доски |
| `template` | `mad_sad_glad`\|`start_stop_continue`\|`four_ls` | какой набор колонок выбран при создании |
| `columns` | list[RetroColumn] | колонки — стабильные строковые id (`"mad"`, `"sad"`, ...), не UUID |
| `cards` | dict[id, RetroCard] | все карточки доски |
| `participants` | dict[id, RetroParticipant] | участники |
| `facilitator_id` | string\|null | id текущего фасилитатора |
| `anonymous_mode` | bool, дефолт `false` | скрывать ли автора карточки от остальных (display-only, см. ниже) |
| `max_votes_per_person` | int, дефолт `5` | бюджет голосов на участника, общий на всю доску |
| `timer_running` | bool | таймер сейчас тикает |
| `timer_ends_at` | datetime\|null | абсолютный дедлайн таймера (см. «Таймер» ниже) |
| `timer_remaining_seconds` | int\|null | снэпшот оставшегося времени на паузе |
| `expires_at` | datetime | как и `Room.expires_at` — 24h с момента создания |

### RetroColumn

`{ id, title, color }` — стабильный список, полностью определяется выбранным `template` при создании доски и не редактируется после (Phase 2 может добавить кастомные колонки).

### RetroParticipant

Аналог `Player`: `id`, `nickname`, `is_facilitator`, `connected`, `disconnected_at`, `avatar_color`. Нет `is_spectator` — в ретро нет режима «только смотреть».

### RetroCard

| Поле | Что значит |
|---|---|
| `id` | uuid |
| `column_id` | в какой колонке лежит |
| `author_id` | кто написал (используется для permission-проверок; на wire остаётся ВСЕГДА, даже в anonymous mode — см. ниже) |
| `text` | содержимое |
| `votes` | `list[participant_id]` — кто проголосовал за эту карточку |

## 3 preset-шаблона (`RETRO_TEMPLATES`)

| Template | Колонки |
|---|---|
| `mad_sad_glad` | Mad (красный) / Sad (жёлтый) / Glad (зелёный) |
| `start_stop_continue` | Start (зелёный) / Stop (красный) / Continue (синий) |
| `four_ls` | Liked (зелёный) / Learned (синий) / Lacked (красный) / Longed for (фиолетовый) |

Выбирается один раз при создании доски (`RetroTemplatePicker.tsx` на `/retro/new`), после — не меняется.

## Роли

| Роль | Кто | Что может |
|---|---|---|
| **Facilitator** | Создатель доски, или первый из оставшихся при уходе предыдущего | Настройки доски (`update_board`), kick, close, старт/пауза/резет таймера, редактирование/удаление ЛЮБОЙ карточки |
| **Participant** | Любой не-фасилитатор | Добавлять карточки, голосовать/снимать голос (в рамках бюджета), редактировать/удалять СВОИ карточки |

## Карточки

### Создание (add_card)

Любой участник. `{ column_id, text }` → новая `RetroCard` с `author_id = отправитель`.

### Редактирование / удаление (edit_card, delete_card)

**Кто**: автор карточки ИЛИ фасилитатор (`_require_card_owner_or_facilitator`) — более разрешительно, чем issues в Planning Poker, потому что карточки ретро — личная рефлексия участника, а не общий backlog.

### Голосование (vote_card, unvote_card)

**Кто**: любой участник, включая автора карточки (можно голосовать за свою же карточку).
**Бюджет**: `max_votes_per_person` — общий лимит голосов **на всю доску**, не на карточку. `RetroBoard.votes_used_by(participant_id)` считает, сколько голосов участник уже потратил суммарно по всем карточкам; `vote_card` отклоняется, если бюджет исчерпан (`RetroError`).
Один клик по кнопке голоса — toggle: если уже голосовал за эту карточку → `unvote_card` освобождает единицу бюджета; иначе `vote_card` тратит.

### Почему карточки не скрыты до «reveal» (в отличие от голосов Planning Poker)

Осознанное решение при планировании Phase 1: anchoring bias в brainstorming ретро менее критичен, чем в численной оценке story points, а скрытие потребовало бы переделать `public_state()` на per-viewer рассылку (сейчас она одна и та же для всех через `broadcast()`). Не оправдано для MVP — карточки видны сразу всем при создании.

## Anonymous mode — display-only, не серверная приватность

`anonymous_mode` — настройка доски (`update_board`, только фасилитатор). Когда включена: фронт скрывает никнейм автора карточки для всех, кроме самого автора (показывает «Anonymous» вместо имени).

**Важно**: `author_id` **всегда** присутствует в `public_state()`, для всех участников, независимо от `anonymous_mode` — он нужен на сервере и клиенте для permission-проверок (кто может редактировать/удалять). Скрытие имени — чисто фронтовая косметика (`RetroCardItem.tsx`: `showAuthor = !anonymousMode || isMine`), а не серверная per-viewer фильтрация. Это сознательное упрощение: инструмент — casual tool для команды, доверяющей друг другу, а не security boundary; per-viewer `public_state()` потребовал бы перехода с `manager.broadcast()` на per-connection `send_to()` вызовы для каждого сообщения — не оправдано для Phase 1.

## Таймер

Facilitator-only: `start_timer { seconds }`, `pause_timer`, `resume_timer`, `reset_timer`.

**Дизайн — абсолютный дедлайн, не серверный тик**: вместо тикающего раз в секунду server-side таймера (что потребовало бы новой фоновой задачи per-board), сервер хранит `timer_ends_at` (абсолютный timestamp). Клиенты сами считают live-countdown локально (`RetroTimer.tsx`: `useEffect` + `setInterval(tick, 250)` от `timer_ends_at`). `pause_timer` снимает снэпшот оставшихся секунд в `timer_remaining_seconds` и останавливает `timer_running`; `resume_timer` пересчитывает новый `timer_ends_at` из снэпшота. `reset_timer` возвращает доску в idle-состояние (`timer_running=false`, `timer_ends_at=null`, `timer_remaining_seconds=null`).

Пресеты на фронте: 3 / 5 / 10 минут (`RetroTimer.tsx:PRESETS_SECONDS`).

## Настройки доски (update_board)

**Кто**: всегда только фасилитатор.

Меняются: `name`, `anonymous_mode`, `max_votes_per_person`.

## Модерация (фасилитатор)

Полностью зеркалит Planning Poker:

### kick_participant

Кикнутому участнику шлётся `{type: "kicked"}`, WS закрывается кодом 4003. Фронт показывает overlay `boardInactive="kicked"`. Участник и все его голоса удаляются из карточек доски.

### close_board

Фасилитатор закрывает доску для всех. Broadcast `{type: "board_closed"}`, доска удаляется из store, все клиенты видят overlay `boardInactive="closed"`.

### Facilitator handoff

Как и `RoomService.remove_player` — при уходе фасилитатора (disconnect > 30s) роль переходит первому из оставшихся участников. **Нет** опции `close_on_facilitator_leave` (issue #19 в Planning Poker) — сознательный scope-trim для Phase 1, более простое поведение, чем у Planning Poker.

## Lifecycle доски и истечение таймера

Полностью зеркалит Planning Poker (`docs/BUSINESS_LOGIC.md` → «Lifecycle комнаты и истечение таймера»), включая Cloudflare-нюанс с close-кодами:

| Событие | Эффект |
|---|---|
| Любое действие сервиса на истёкшей доске | `RetroError("Board has expired")` |
| `cleanup_expired_boards` (каждые 60s) | broadcast `{type: "board_expired", reason: "timer"}`, закрывает WS, удаляет доску |
| Новый WS-connect к отсутствующей/истёкшей доске | `{type: "board_inactive", reason: "not_found"\|"expired"}` перед close — тот же приём, что и `room_inactive`, потому что Render/Cloudflare strip'ит custom close-коды (4000-4999) в проде |
| Дефолтный lifetime | 24 часа (`retro_service.BOARD_LIFETIME`) |

## Disconnect и grace-период

Идентично Planning Poker: `mark_disconnected` → 30s grace → `cleanup_disconnected_participants` (каждые 5s) удаляет. Реконнект в течение окна восстанавливает того же участника через `participant_id` из `localStorage` (`retro:{boardId}:participant_id`).

## WS-протокол

**Client → Server**:

```
{ type: "add_card", column_id, text }
{ type: "edit_card", card_id, text }
{ type: "delete_card", card_id }
{ type: "vote_card", card_id }
{ type: "unvote_card", card_id }
{ type: "start_timer", seconds }
{ type: "pause_timer" }
{ type: "resume_timer" }
{ type: "reset_timer" }
{ type: "update_board", name?, anonymous_mode?, max_votes_per_person? }
{ type: "update_nickname", nickname }
{ type: "update_avatar_color", color }
{ type: "kick_participant", target_id }
{ type: "close_board" }
```

**Server → Client**:

```
{ type: "joined", participant_id }
{ type: "board_state", state }
{ type: "kicked" }
{ type: "board_closed" }
{ type: "board_expired", reason: "timer" }
{ type: "board_inactive", reason: "not_found" | "expired" }
{ type: "error", message }
```

После каждой успешной мутации — broadcast `board_state` всем участникам доски.

## Public state (что видит клиент)

`RetroBoard.public_state()`:

```ts
{
  id, name, template,
  columns: RetroColumn[],
  cards: RetroCard[],           // author_id всегда виден, даже в anonymous_mode
  participants: RetroParticipant[],
  facilitator_id,
  anonymous_mode, max_votes_per_person,
  timer_running, timer_ends_at, timer_remaining_seconds,
  expires_at,
}
```

## Роуты и REST

См. `docs/ARCHITECTURE.md` → «Retro Board» для полной REST/WS-таблицы и структуры файлов.
