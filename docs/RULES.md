# Правила работы с репозиторием

Правила, которые действуют для всех, кто работает с этим репо — включая Claude.

## 🛑 Definition of Done (правило #0)

**Задача не считается выполненной, пока документация не обновлена.** Это не «приятный бонус», это часть результата — наравне с кодом и тестами.

Перед тем как сказать «готово», открыть PR или ответить пользователю «сделано», **обязательно**:

1. Пройти по diff и спросить себя: какой документ описывает то, что я только что изменил?
2. Если такой документ есть и стал неактуальным — обновить **в том же PR**.
3. Если описывающего документа нет, но изменение того стоит — создать.
4. Список документов под аудит:
   - `README.md` — внешняя витрина (стек, фичи, запуск, релизы)
   - `CLAUDE.md` — гайд для агента (архитектура, branching, deploy, тесты, releases)
   - `docs/ARCHITECTURE.md` — слои, контракты, потоки данных
   - `docs/BUSINESS_LOGIC.md` — сущности, права, lifecycle, протокол (Planning Poker)
   - `docs/RETRO_BUSINESS_LOGIC.md` — то же самое для Retro Board (issue #62)
   - `docs/DEPLOY_SETUP.md` — одноразовые UI-шаги на Render/Vercel
   - `docs/RELEASES.md` — release flow, conventional commits, версионирование
   - `docs/TESTING.md` — как запускать тесты, что покрыто, CI
   - `docs/RULES.md` — этот файл; новые правила/конвенции **обязательно** сюда
   - `.claude/skills/pp-deploy/SKILL.md` — release/deploy operations для Claude
   - `.claude/skills/pp-feature/SKILL.md` — добавление фич
   - `frontend/.env.example` / любые конфиги — если изменилось поведение env vars
5. Тесты — это тоже документация: новое бизнес-правило → e2e/pytest в том же PR (правило 13).
6. Эта проверка применяется **к каждому** PR, даже к самым маленьким. Никакого «потом задокументирую».
7. **После push feature ветки (sync-to-dev отработал) — обязательно открыть dev-URL и проверить что фича работает в живую перед мерджем PR в `main`.** Зелёные локальные тесты не гарантируют что фича выживет в проде: разница между dev-окружением и production-стеком есть всегда. Пример из практики: PR #25 (room expiration) проходил все 106 pytest + 7 Playwright локально, но в проде упирался в Cloudflare Render'а — strip'ал custom WS close-коды (4004/4005 → 1005), пользователь видел «Connecting…» вместо overlay. Bug всплыл когда пользователь зашёл по живой ссылке, а не я после merge'а. Контракт:
   - push feature ветки → жди ~3-5 мин (Render dev-бэк rebuild + Vercel git-dev alias rebuild — это `sync-to-dev` отрабатывает мгновенно, дальше уже сами платформы)
   - Открой `https://frontend-git-dev-vadims-projects-2f476800.vercel.app/...` и пройди главный happy-path фичи
   - Если что-то ломается в проде но работает локально — высока вероятность отличия инфры (CDN, proxy, env vars, cold start). Открыть follow-up issue, починить fix-PR'ом ДО мерджа feature → main.

**Если откладываешь doc-update или live smoke-test — это считается неполной задачей**, и нужно сразу создать follow-up issue с label `docs-debt`.

## Git и ветки

1. **Никогда не пушить напрямую в `main` без явного разрешения владельца.**
   - Допустимо: создать ветку → запушить → открыть PR → дождаться review.
   - Недопустимо: `git push origin main` без отдельного согласования в этой сессии.

2. **Feature ветка идёт напрямую в `main`. `dev` — staging-зеркало, не отдельная стадия PR.**
   - Новые фичи / правки ответвлять от `main` (или `dev` — оба валидны, sync workflow всё равно подровняет): `git checkout -b feat/<short-name> main`.
   - **Push ветки → автоматически случаются ДВЕ вещи:**
     - `.github/workflows/sync-to-dev.yml` мерджит ветку в `dev` → срабатывают деплои dev-бэка на Render + `git-dev` Vercel-алиаса. Это твой preview.
     - `.github/workflows/auto-pr-to-main.yml` открывает PR `feat/<...>  → main` (или no-op'ит если уже открыт). Title по дефолту `<prefix>: <rest>`, отредактируй до чистого conventional-commit'а перед мерджем.
   - **Merge method**: `feature → main` всегда **Squash and merge**. Title PR становится единым conventional-коммитом на `main` — title PR станет финальным сообщением коммита на `main`. Никогда не мерджить feature ветку в `dev` вручную — sync workflow это уже сделал.
   - PR `dev → main` больше **нет** в флоу (старый `auto-promote.yml` удалён). Не открывай его руками.
   - Feature ветки авто-удаляются после merge (`delete_branch_on_merge=true`).
   - Если ветка отстала и `sync-to-dev` упал на конфликте — `git fetch && git rebase origin/dev && git push --force-with-lease` (на feature ветке force-with-lease допустим, на `dev`/`main` — нет).

3. **Коммиты — на английском, по [Conventional Commits](https://www.conventionalcommits.org/).**
    Соглашение, не требование инструментов — release-please был снят (см. `docs/RELEASES.md`). Шапка: `<type>: <короткое описание>`, до 70 символов, без эмодзи.
    Типичные префиксы:
    - `feat:` новая фича
    - `fix:` баг
    - `perf:`, `refactor:` улучшения без user-facing-изменений
    - `docs:`, `ci:`, `test:` — служебные категории
    - `chore:`, `build:`, `style:` — мелочи
    - `feat!:` / `fix!:` или `BREAKING CHANGE:` в теле — несовместимые изменения
    Примеры:
    ```
    feat: telegram login widget on home page
    fix: revote button hidden when who_can_reveal=everyone
    docs: explain disconnect grace period in BUSINESS_LOGIC.md
    ```
    Старые коммиты (без префикса) — нормально, никто не ругается.

4. **Не пушить секреты.** `.env`, `*.key`, `credentials.json` не коммитятся. `.gitignore` уже их закрывает.

## Деплой

5. **`render.yaml` — единственный источник истины для Render.**
   - Изменения в деплое бэка — только через `render.yaml`. Не править руками сервисы в Render UI, кроме `CORS_ORIGINS` env var.
   - Артефакты в `backend/` (`Dockerfile`, `Procfile`, `railway.toml`, `nixpacks.toml`) **не используются** — это legacy от Railway.

6. **Vercel: один проект, две scope env-переменные.**
   - Production scope `VITE_API_URL` = prod Render URL.
   - Preview scope `VITE_API_URL` = dev Render URL.
   - Менять только в Vercel UI; не использовать `.env` файлы в репозитории (кроме `.env.example`).

7. **При добавлении нового Vercel-URL (custom-домена, новой preview-ветки) — обязательно добавить его в `CORS_ORIGINS` соответствующего Render-сервиса.** Иначе фронт получит CORS-блок и WS не подключится.

## Код

8. **Бизнес-логика — только в `services.py`.**
   - `main.py` парсит сообщения и делегирует. Никаких мутаций модели в `main.py`.
   - Если нужна новая операция: добавить метод в `RoomService`, добавить ветку в `handle_message`, обновить `BUSINESS_LOGIC.md`.

9. **После любой мутации состояния — broadcast `room_state`.**
   - Без этого клиенты разойдутся в состоянии.
   - Исключение: `draw_*`, `countdown` — релей, не меняют состояние.

10. **Хранилище — через `RoomStore` Protocol.**
    - Сервис не знает, что за store. Любая новая фича не должна напрямую обращаться к `InMemoryRoomStore`.
    - Если нужна новая операция над store — расширить Protocol и реализацию.

11. **Карты — строки.**
    - Никогда не парсить карту как int на уровне модели — это сломает `?`, `☕`, T-shirt.
    - Преобразование в число — только в `compute_stats` через `float(v)` с `try/except`.

12. **Права действий — через `_require_facilitator()` / `_require_can_manage_issues()`.**
    - Не хардкодить `if room.facilitator_id == ...` в новых методах. Использовать хелперы.
    - При добавлении новой настройки прав — добавить хелпер и применять единообразно.

## 🛑 Новая функциональность = код + тесты + доки (обязательно)

13. **Любой новый функционал с новой бизнес-логикой ДОЛЖЕН прилететь одним PR в составе.** Дополняет общий Definition of Done из правила #0 — здесь конкретика для бизнес-логики.

    **1) Код** — реализация на правильном слое (`services.py` для логики, см. правило 8).

    **2) Тесты** — *обязательно*, не «потом»:
    - **Backend (pytest)** на каждое новое поведение `RoomService`. Имя теста читается как спецификация: `test_facilitator_cannot_become_spectator`, `test_revote_recomputes_issue_estimate_from_new_mode`. Файл — соответствующий area (`test_rooms.py`, `test_voting.py`, `test_issues.py`, `test_permissions.py`, `test_websocket.py`).
    - **Frontend e2e (Playwright)** если фича видна юзеру. Один сценарий = один пользовательский flow. Использовать хелперы из `helpers.ts`.
    - **Негативные кейсы** — что должно НЕ работать (попытка зрителя голосовать, не-фасилитатор reveal'ит когда `who_can_reveal=facilitator` и т.д.) — отдельные тесты.

    **3) Документация** — обновить **в том же PR**:
    - `docs/BUSINESS_LOGIC.md` — описание нового правила/lifecycle/permission. Если ввели новую сущность или новое поле в существующей — добавить в соответствующую таблицу.
    - `docs/ARCHITECTURE.md` — если изменился контракт между слоями (например, новый WS-тип сообщения, новое поле в `public_state()`).
    - `CLAUDE.md` секция "WebSocket Protocol" / "Key Design Decisions" — если затрагивается описанная там логика.
    - `README.md` секция "Возможности" — если фича видна юзеру.
    - `docs/TESTING.md` — если добавили новый test file или изменили способ запуска тестов.
    - Полный список документов для аудита — см. правило #0 (Definition of Done) в начале файла.

    **Без чего PR не закрывается:**
    - ❌ Код есть, тестов нет → не готово.
    - ❌ Тесты есть, доки не обновлены → не готово.
    - ❌ «Потом дотестирую / задокументирую» — НЕ работает. Открыть follow-up issue с label `tech-debt` или `docs-debt`, не делать вид что задача завершена.

    **Зачем так строго:** через 3 недели ни я, ни ты не вспомним почему `who_can_reveal=everyone` именно так работает. Тест и `BUSINESS_LOGIC.md` — это память репо. Без них фича становится магией, которую страшно трогать.

14. **E2E тесты — это исполняемая документация.**
    - Имя теста = одно предложение, описывающее бизнес-правило.
    - В теле теста: одно правило = один `test_*`. Не валить в один большой тест.
    - При изменении правила (например, поменяли `who_can_reveal` default) — менять тест в **этом же** PR, не отдельным «починю тесты потом».
    - Тесты на `RoomService` пишутся через `service` fixture (без HTTP/WS). На WS-протокол — через `client` fixture (`TestClient`).
    - Playwright e2e: один сценарий = один основной flow. Multi-user — через `browser.newContext()` на каждого юзера.

19. **CI на каждый push/PR.** GitHub Actions (`.github/workflows/ci.yml`) гоняет pytest + Playwright. Не мержить PR с красным CI без объяснимой причины. Если падает только e2e — скачать `playwright-report` артефакт из ран'а, посмотреть видео.

20. **Branch protection на `main` и `dev`** — включена через GitHub API.

    **`main` (strict gate перед prod):**
    - **Required status checks**: `Backend pytest` + `Frontend Playwright e2e` — оба должны быть зелёными.
    - **Strict** (require branches to be up to date): **выключено**. В новом флоу feature ветки расходятся с `main` независимо (sync-to-dev мерджит их в `dev` параллельно), и заставлять каждую делать rebase на свежий `main` сломает поток. Squash-merge сам справится с reconciliation.
    - No force pushes, no deletion.
    - `enforce_admins=false` — ты как админ можешь обойти в экстренной ситуации (исключение, не правило).

    **`dev` (softer floor — protect against the catastrophic):**
    - No force pushes, no deletion. Это главное: без него force-push какого-нибудь sync workflow'а может снести историю.
    - **НЕ требуем** status checks и PR на push — `sync-to-dev` и `back-merge` пушат напрямую от `github-actions[bot]`, мы не хотим их блокировать. Дисциплина «feature → main только через PR» держится branch protection'ом самого `main`.

    Изменить — через PUT `/repos/vdmemory/planning-poker/branches/{main|dev}/protection` или в `Settings → Branches` в UI.

21. **Auto-triage для новых issues.** Workflow `.github/workflows/auto-triage.yml` стартует на каждый новый issue:
    - Скрипт `.github/scripts/auto_triage.py` дёргает GitHub Models (`gpt-4o-mini`, бесплатно)
    - Постит комментарий с оценкой сложности, planом, файлами для правки, рисками
    - Ставит label'ы: `easy`/`medium`/`hard`, `backend`/`frontend`/`fullstack`, опционально `security`/`breaking-change`/`needs-clarification`, плюс `auto-triaged`
    - **Кода не пишет** — только анализ
    - Чтобы перетриажить — навесить label `re-triage`, workflow сам его снимет после запуска
    - Стоимость: $0 (GitHub Models free tier; rate limits действуют, но для нескольких issue в день хватит с запасом)

22. **Back-merge main → dev после релиза.** Workflow `.github/workflows/back-merge.yml` стартует на каждый push в `main`:
    - Если `dev` уже содержит `main`'s HEAD — exit (nothing to do).
    - Иначе делает `git merge --no-ff origin/main` с сообщением `Merge branch 'main' into dev (back-merge after release)`.
    - Если merge clean → push в `dev`. Любые точечные правки на main (включая hotfix'ы) появляются в staging.
    - Если конфликт → открывает issue с label `tech-debt` и рецептом ручного резолва.
    - В текущем флоу back-merge нужен только для редкого случая «правка на main мимо sync-to-dev» — fixup-коммит, ручной hotfix или что-то подобное.

23. **Sync-to-dev на каждый push feature ветки.** Workflow `.github/workflows/sync-to-dev.yml` слушает push в `feat/**`, `fix/**`, `chore/**`, `refactor/**`, `docs/**`:
    - Если `dev` уже содержит ветку → no-op.
    - Иначе `git merge --no-ff origin/<branch>` с сообщением `Mirror <branch> → dev (staging)` → push в `dev`.
    - Если конфликт → fail + comment в открытом PR с recipe-кой `git rebase origin/dev`.
    - Параллельно `auto-pr-to-main.yml` открывает PR `<branch> → main` (если ещё не открыт). Title по дефолту `<prefix>: <rest>` — отредактируй до читаемого вида перед мерджем.
    - Не открывай PR feature → dev руками. Sync workflow это уже делает.

14. **`CLAUDE.md` — для агента.**
    - Туда идут инструкции по работе с кодом и деплоем для Claude Code.
    - Не дублировать в README то, что уже есть в CLAUDE.md; и наоборот.

15. **`README.md` — внешняя витрина.**
    - Что это, как запустить, как задеплоить, что есть в фичах.
    - Не валит технические детали реализации — для них есть `docs/ARCHITECTURE.md`.

## Окружения

16. **`CORS_ORIGINS` пустая = `allow_origins=["*"]`.**
    - Это **только** для dev (локально). В Render всегда задавать конкретные origins.

17. **`VITE_API_URL` пустая = Vite proxy на `localhost:8000`.**
    - Это **только** для dev (локально). На Vercel всегда задавать абсолютный URL.

18. **Render free tier засыпает.**
    - Первый запрос после паузы — холодный старт ~30s.
    - Фронт умеет это переваривать (auto-reconnect WS), но в UAT-тестах учитывать.
