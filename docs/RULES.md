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
   - `docs/BUSINESS_LOGIC.md` — сущности, права, lifecycle, протокол
   - `docs/DEPLOY_SETUP.md` — одноразовые UI-шаги на Render/Vercel
   - `docs/RELEASES.md` — release flow, conventional commits, версионирование
   - `docs/TESTING.md` — как запускать тесты, что покрыто, CI
   - `docs/RULES.md` — этот файл; новые правила/конвенции **обязательно** сюда
   - `.claude/skills/pp-deploy/SKILL.md` — release/deploy operations для Claude
   - `.claude/skills/pp-feature/SKILL.md` — добавление фич
   - `frontend/.env.example` / любые конфиги — если изменилось поведение env vars
5. Тесты — это тоже документация: новое бизнес-правило → e2e/pytest в том же PR (правило 13).
6. Эта проверка применяется **к каждому** PR, даже к самым маленьким. Никакого «потом задокументирую».

**Если откладываешь doc-update — это считается неполной задачей**, и нужно сразу создать follow-up issue с label `docs-debt`.

## Git и ветки

1. **Никогда не пушить напрямую в `main` без явного разрешения владельца.**
   - Допустимо: создать ветку → запушить → открыть PR → дождаться review.
   - Недопустимо: `git push origin main` без отдельного согласования в этой сессии.

2. **Базовая ветка для новой работы — `dev`. Двухступенчатый flow.**
   - Новые фичи / правки ответвлять от `dev`: `git checkout -b feat/<short-name> dev`.
   - Merge: feature → `dev` → ревью → `dev` → `main` (с разрешения).
   - **PR `dev → main` создаётся автоматически** workflow'ом `.github/workflows/auto-promote.yml` после каждого push в `dev`. Если PR уже открыт — он сам подтянет новые коммиты. Если закрыт — workflow откроет новый.
   - **Merge methods (важно):**
     - `feature → dev`: **Squash and merge**. Один PR = один conventional-commit в истории `dev` (`feat: ...`, `fix: ...`). Title squash-коммита = title PR (поэтому title PR — это и есть твой conventional commit).
     - `dev → main`: **Create a merge commit** (НЕ squash). Squash здесь сольёт все 5 feat: коммитов в один title PR — и release-please увидит только title (если он не conventional — пропустит всё). Merge commit сохраняет индивидуальные `feat:` коммиты, release-please их корректно разнесёт по секциям CHANGELOG.
   - Feature ветки авто-удаляются после merge (`delete_branch_on_merge=true`).

3. **Коммиты — на английском, по [Conventional Commits](https://www.conventionalcommits.org/).**
    Это требование от release-please (`docs/RELEASES.md`).
    Шапка: `<type>: <короткое описание>`, до 70 символов, без эмодзи.
    Допустимые типы:
    - `feat:` новая фича (bumps minor)
    - `fix:` баг (bumps patch)
    - `perf:`, `refactor:` (bumps patch)
    - `docs:`, `ci:`, `test:` (в changelog, без bump)
    - `chore:`, `build:`, `style:` (скрыты в changelog, без bump)
    - `feat!:` / `fix!:` или `BREAKING CHANGE:` в теле → major bump
    Примеры:
    ```
    feat: telegram login widget on home page
    fix: revote button hidden when who_can_reveal=everyone
    docs: explain disconnect grace period in BUSINESS_LOGIC.md
    ```
    Старые коммиты (без префикса) релиз-плиз просто проигнорит — не будет на них ругаться.

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
    - **Strict** (require branches to be up to date): нельзя мержить, если source отстаёт от `main`.
    - No force pushes, no deletion.
    - `enforce_admins=false` — ты как админ можешь обойти в экстренной ситуации (исключение, не правило).

    **`dev` (softer floor — protect against the catastrophic):**
    - No force pushes, no deletion. Это главное: без него `delete_branch_on_merge=true` снесёт ветку после dev→main merge (так и случилось в первой итерации — пришлось пересоздавать dev из main).
    - **НЕ требуем** status checks и PR на push — back-merge workflow пушит напрямую от `github-actions[bot]`, мы не хотим его блокировать. Дисциплина feature → dev через PR держится самостоятельно.

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
    - Иначе делает `git merge --no-ff origin/main` с сообщением `Merge branch 'main' into dev (back-merge after release)` (этот префикс auto-promote.yml skips, чтобы не создавать дублирующий promote PR).
    - Если merge clean → push в `dev`. Следующий `dev → main` PR разблокирован.
    - Если конфликт → открывает issue с label `tech-debt` и рецептом ручного резолва.
    - Без этого workflow следующий `dev → main` PR блокировался бы на `mergeable_state: behind` из-за `strict: true` в branch protection.

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
