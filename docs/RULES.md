# Правила работы с репозиторием

Правила, которые действуют для всех, кто работает с этим репо — включая Claude.

## Git и ветки

1. **Никогда не пушить напрямую в `main` без явного разрешения владельца.**
   - Допустимо: создать ветку → запушить → открыть PR → дождаться review.
   - Недопустимо: `git push origin main` без отдельного согласования в этой сессии.

2. **Базовая ветка для новой работы — `dev`.**
   - Новые фичи / правки ответвлять от `dev`: `git checkout -b feat/<short-name> dev`.
   - Merge: feature → `dev` → ревью → `dev` → `main` (с разрешения).

3. **Коммиты — на английском, в стиле существующих** (`git log --oneline -10` для образца). Заголовок до 70 символов, без эмодзи, без `feat:`/`fix:` обязательного префикса (стиль repo смешанный).

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

## Документация

13. **Документация — часть результата, а не «потом».** При изменении деплоя / стека / бизнес-логики — в **том же PR** обновлять:
    - Деплой → `README.md`, `CLAUDE.md` (раздел Branching & Deployment), `docs/DEPLOY_SETUP.md`.
    - Бизнес-логика / роли / правила → `docs/BUSINESS_LOGIC.md` **+ e2e тест в `backend/tests/`**.
    - Архитектура / слои / поток данных → `docs/ARCHITECTURE.md`.
    - Внутренние правила для Claude — этот файл и `CLAUDE.md`.
    - Новая UI-фича → Playwright e2e в `frontend/tests/e2e/` + `docs/TESTING.md`.
    - **E2E тесты — это исполняемая документация.** Если бизнес-правило существует, оно должно быть зафиксировано тестом. Имя теста читается как спецификация (`test_facilitator_cannot_become_spectator`).
    - Перед закрытием задачи: пробежать по diff — нет ли упомянутых файлов/концепций в документах, которые нужно подправить?

19. **CI на каждый push/PR.** GitHub Actions (`.github/workflows/ci.yml`) гоняет pytest + Playwright. Не мержить PR с красным CI без объяснимой причины. Если падает только e2e — скачать `playwright-report` артефакт из ран'а, посмотреть видео.

20. **Branch protection на `main`.** Включено через GitHub API. Что включено:
    - **Required status checks**: `Backend pytest` + `Frontend Playwright e2e` — оба должны быть зелёными.
    - **Strict** (require branches to be up to date): нельзя мержить, если ветка отстаёт от `main`.
    - **No force pushes**, **no deletion**.
    - **enforce_admins=false**: ты как админ можешь обойти в экстренной ситуации (но это исключение, не правило).

    Изменить набор обязательных чеков (например, добавить новый job) — через PUT `/repos/vdmemory/planning-poker/branches/main/protection` или в `Settings → Branches` в UI.

21. **Auto-triage для новых issues.** Workflow `.github/workflows/auto-triage.yml` стартует на каждый новый issue:
    - Скрипт `.github/scripts/auto_triage.py` дёргает GitHub Models (`gpt-4o-mini`, бесплатно)
    - Постит комментарий с оценкой сложности, planом, файлами для правки, рисками
    - Ставит label'ы: `easy`/`medium`/`hard`, `backend`/`frontend`/`fullstack`, опционально `security`/`breaking-change`/`needs-clarification`, плюс `auto-triaged`
    - **Кода не пишет** — только анализ
    - Чтобы перетриажить — навесить label `re-triage`, workflow сам его снимет после запуска
    - Стоимость: $0 (GitHub Models free tier; rate limits действуют, но для нескольких issue в день хватит с запасом)

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
