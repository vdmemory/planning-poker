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

## Группировка карточек — drag-to-merge (issue #62 Phase 2)

Перетаскивание одной карточки на другую объединяет их в «стопку» — общий визуальный кластер с бейджем количества карточек. Модель: `RetroCard.group_id: str | None`.

- `group_id is None` — карточка либо стоит отдельно, либо сама является **головой** стопки (head).
- `group_id = X` — карточка является **дочерней** (child) карточкой стопки, чья голова — карточка с id `X`.
- Инвариант: `group_id` головы всегда `None` — цепочка никогда не превышает одного шага (resolve head — O(1), без рекурсии).

### group_cards(source_card_id, target_card_id)

**Кто**: любой участник — в отличие от edit/delete, группировка не привязана к авторству (кластеризация похожих мыслей — командное действие, а не персональное).

**Правила**:
- `source_card_id` и `target_card_id` должны быть в **одной колонке** (`RetroError("Cannot group cards from different columns")`) — иначе теряется смысл "колонки" как группы.
- Нельзя группировать карточку саму с собой.
- Если обе уже в одной стопке — `RetroError("Cards are already in the same group")`.
- Если `target_card_id` сам является дочерней карточкой — группировка резолвится к ГОЛОВЕ этой стопки прозрачно для пользователя (drop на любую карточку стопки эквивалентен drop на голову).
- **Что именно двигается зависит от того, что перетащили** — «двигается то, за что схватились», а не всегда целая стопка:
  - Перетащили **дочернюю карточку** (`source.group_id is not None`) → двигается только она одна, остальная её бывшая стопка не трогается.
  - Перетащили **голову стопки** (сама карточка без `group_id`, но, возможно, с детьми) → едет вся стопка целиком (голова + все дети) — так две стопки сливаются в одну.

  (Регрессия, найденная и исправленная после первой реализации Phase 2: изначально `group_cards` всегда резолвил `source` к его ГОЛОВЕ и тащил всю бывшую стопку целиком, даже если пользователь перетаскивал одну-единственную дочернюю карточку — то есть перетаскивание карточки B из стопки [A(голова), B(ребёнок)] на карточку C неожиданно утаскивало и A тоже. Теперь head тащит стопку, child тащит только себя.)

### ungroup_card(card_id)

**Кто**: любой участник.

- Если карточка — **дочерняя** (`group_id is not None`): просто отвязывается (`group_id = None`), остальная стопка не затрагивается.
- Если карточка — **голова** с детьми: вся стопка **распадается** — все дети становятся `group_id = None` (никто не «наследует» роль головы). Осознанное упрощение: стопка живёт, только пока её изначальная голова её ведёт.
- Если карточка ни то, ни другое (стоит отдельно) — `RetroError("Card is not part of a group")`.

### Удаление головы стопки (delete_card)

Если удаляется голова с детьми, `delete_card` **промоутит первого ребёнка** в новую голову (а не распускает стопку, как `ungroup_card`) — иначе у оставшихся детей `group_id` указывал бы на несуществующую карточку. Единственное место, где новый head назначается автоматически.

### Frontend: Pointer Events вместо HTML5 Drag-and-Drop

Перетаскивание реализовано вручную через **Pointer Events API** (`onPointerDown`/`onPointerMove`/`onPointerUp` + `setPointerCapture`) — не нативный HTML5 `draggable`, который не работает на тач-устройствах. `setPointerCapture` на маленькой «ручке» (grip, `⠿`) каждой карточки гарантирует, что все последующие move/up-события продолжают приходить именно на эту ручку независимо от того, над каким элементом физически находится палец/курсор — не нужны document-level листенеры.

Хук `useRetroCardDrag` (`frontend/src/hooks/useRetroCardDrag.ts`) на каждом `pointermove` вызывает `document.elementFromPoint(clientX, clientY)` чтобы определить карточку и колонку под курсором. **Кросс-колоночный drop и drop внутри собственной стопки отклоняются на клиенте** молча (без подсветки, без WS-сообщения) — сервер тоже отклонил бы оба случая (`group_cards` требует одной колонки и разных стопок), но полноэкранный error-оверлей `RetroBoardPage` не подходящее место для реакции на случайный неверный drop, только для настоящих багов.

**Регрессия, найденная и исправленная**: изначально клиент фильтровал только cross-column drop — но НЕ фильтровал drop карточки на любую карточку из её же собственной стопки (голова на своего ребёнка, ребёнок на свою голову, сиблинг на сиблинга). Так как дети рендерятся прямо под своей головой (визуально смежно), это была лёгкая, обыденная случайность при перетаскивании — и раз сервер отвечал `RetroError("Cards are already in the same group")`, вся страница обваливалась в полноэкранный `"Something went wrong"`. Исправлено: `useRetroCardDrag` резолвит голову источника и цели прямо из DOM (`data-group-id`, который `RetroCardItem` пишет из `card.group_id`) через `resolveHeadFromDom()` и не подсвечивает/не шлёт WS-сообщение, если головы совпадают — тот же приём, что уже применялся для cross-column.

## Реакции на карточки (issue #62 Phase 2)

Быстрые эмодзи-реакции на конкретную карточку — облегчённый аналог Planning Poker's `reaction`/`throw_reaction` (issue #32/#51): чисто эфемерный relay, **ничего не пишется** в `RetroCard` или `RetroBoard`.

**WS**: `{ type: "react_to_card", card_id, value }` → сервер валидирует (участник в доске, карточка существует, `value` не пустой) и broadcast'ит `{ type: "card_reaction", card_id, from_participant_id, from_nickname, value }` **всем клиентам, включая отправителя** (чтобы его собственный оверлей тоже всплыл).

Фронт: `useRetroCardReactions` — упрощённый вариант `useReactionAnimations` (issue #32), только on-card оверлей (`reactions-overlay-pop`, переиспользуется CSS-анимация 1-в-1), без «плавающих» иконок в углу экрана — для реакции на карточку нет единого «угла отправителя», как у реакции на игрока. Оверлей живёт 3 секунды, затем сам скрывается.

## Мобильная адаптация (issue #62 Phase 2)

Ручка перетаскивания (`data-testid="retro-card-grip"`) и реакции — обычные элементы в собственном layout'е карточки (не floating-оверлеи), поэтому не требуют никакой capability-based hover-логики (`@media(hover:hover)` и т.п.) — они одинаково работают что мышью, что пальцем, без специального кейса под тач-устройства.

**Регрессия, найденная и исправленная в этом же PR**: первая реализация реакций рендерила `RetroCardReactionBar` как floating-оверлей (`position: absolute`, hover-reveal на десктопе / всегда видимый на тач-устройствах), позиционированный ПОВЕРХ самой карточки. Так как карточки в колонке стоят плотно (`space-y-2` — всего 8px между ними, в отличие от игровых карточек Planning Poker на просторном овальном столе), у оверлея физически не было места, чтобы не перекрыть текст самой карточки — на десктопе текст становился нечитаемым при любом наведении (в том числе при клике на vote/edit/delete, которые требуют навести мышь на карточку), а на тач-устройствах, где hover-состояния не существует, панель реакций перекрывала текст **постоянно**, на 100% времени. Исправлено: реакция теперь — маленькая кнопка-триггер в собственном ряду действий карточки (там же, где edit/delete/vote), по клику открывающая popover эмодзи, который разворачивается **вниз** (`top-full`, а не `bottom-full`) — так popover уходит в пустое пространство под карточкой, а не на её же текст. Регрессионный e2e-тест (`retro-board-phase2.spec.ts` → «reaction popover never overlaps the card's own text») сравнивает bounding box'ы текста и popover'а напрямую, потому что `toBeVisible()` не ловит геометрическое перекрытие.

Genuine touch-drag группировки не покрыт e2e-тестами (см. `docs/TESTING.md`) — синтетические `TouchEvent`, диспатченные тестом, не транслируются браузером в `PointerEvent` так, как это делает реальное аппаратное прикосновение; e2e использует настоящий `page.mouse` (который Chromium честно транслирует в `PointerEvent`) вместо этого.

## Роуты и REST

См. `docs/ARCHITECTURE.md` → «Retro Board» для полной REST/WS-таблицы и структуры файлов.
