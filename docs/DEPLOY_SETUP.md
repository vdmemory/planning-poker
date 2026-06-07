# Настройка dev-среды на Render и Vercel

Этот документ — последний ручной шаг, чтобы привязать ветку `dev` к отдельным URL на Render и Vercel. После него любой push в `dev` будет автоматически деплоиться в staging.

Код, конфиги и память уже готовы:
- `render.yaml` описывает Blueprint с двумя сервисами (main + dev).
- Документация (README, CLAUDE.md, docs/) описывает оба окружения.
- Ветка `dev` создана и запушена.

Остаются два шага в UI платформ — оба ОДНОРАЗОВЫЕ.

---

## Шаг 1. Render — синхронизировать Blueprint (одна ссылка, один клик)

1. Открыть [Render Dashboard → Blueprints](https://dashboard.render.com/blueprints).
2. **New Blueprint Instance** → выбрать GitHub-репо `planning-poker`. Если репо не показывается, нажать **Configure GitHub App** и дать доступ.
3. Branch для синхронизации: **`main`** (Render будет следить за `render.yaml` в этой ветке, но создаст оба сервиса).
4. Apply. Render прочитает `render.yaml` и создаст:
   - `planning-poker-backend` (auto-deploy on push to `main`)
   - `planning-poker-backend-dev` (auto-deploy on push to `dev`)
5. Дождаться первого деплоя обоих сервисов (~3-5 минут).
6. В Environment каждого сервиса задать `CORS_ORIGINS` (без trailing slash, через запятую если несколько):
   - **prod**: URL prod-фронта (см. шаг 2)
   - **dev**: URL dev-фронта (см. шаг 2)
7. Проверить healthcheck:
   - `https://planning-poker-backend.onrender.com/healthz`
   - `https://planning-poker-backend-dev.onrender.com/healthz`

**Важно**: если первичный prod-сервис УЖЕ создан вручную (не через Blueprint), Render не возьмёт его под управление Blueprint автоматически — он создаст новый сервис рядом. В этом случае:
- Вариант A: удалить старый ручной сервис и переключиться на blueprint-сервис (DNS/URL поменяется).
- Вариант B: оставить старый, новый Blueprint-сервис переименовать или удалить, а dev-сервис создать отдельно как Web Service из `render.yaml` (или вручную).

---

## Шаг 2. Vercel — подключить GitHub и настроить env vars

Текущий Vercel-проект называется `frontend` (team `Vadim's projects`, root dir `frontend`). У него уже есть `VITE_API_URL` для Production. Нужно:

1. Vercel Dashboard → проект `frontend` → **Settings → Git** → **Connect Git Repository** → выбрать `vdmemory/planning-poker`. Это даёт автоматические preview-деплои для не-main веток (включая `dev`).
2. **Settings → Environment Variables** → у переменной `VITE_API_URL`:
   - **Production** scope (main): должен быть `https://planning-poker-backend.onrender.com` (или текущий prod-URL).
   - **Preview** scope (все ветки кроме main): добавить значение `https://planning-poker-backend-dev.onrender.com`.

   Если хочется ещё более точно — можно создать ещё одну запись только для ветки `dev` (Preview → Branch: `dev`).
3. **Settings → Git → Production Branch**: убедиться что стоит `main`.
4. После настройки сделать новый деплой `dev`: либо merge какого-нибудь PR в `dev`, либо вручную через `vercel --target=preview` из `frontend/`. Vercel выдаст preview-URL, а также стабильный alias:
   ```
   https://frontend-git-dev-vadims-projects-2f476800.vercel.app
   ```
   (точный alias виден в Vercel UI у деплоя).
5. Скопировать этот dev-alias и положить в `CORS_ORIGINS` dev-сервиса на Render (Шаг 1.6).

---

## Шаг 3. Проверка end-to-end

1. На prod: открыть prod-URL Vercel → создать комнату → убедиться что WS подключается и работает.
2. На dev: открыть dev-alias Vercel → создать комнату → убедиться что WS бьёт в dev-Render. Открыть DevTools → Network → WS — там должен быть `wss://planning-poker-backend-dev.onrender.com/ws/...`.
3. Тест изоляции: создать комнату на prod, попытаться зайти по тому же `room_id` на dev → должно быть «комната не найдена». Это подтверждает, что бэки разные и не пересекаются (in-memory store у каждого свой).

---

## Что было сделано через CLI, что — не получилось

Через CLI:
- Создана и запушена ветка `dev`.
- Обновлён `render.yaml` до двух-сервисного Blueprint.
- Проверена авторизация Vercel CLI, подтверждено что проект существует, проверено что Production env var есть.

Не получилось через CLI:
- Привязать GitHub-репо к Vercel-проекту — это OAuth-операция, доступная только из дашборда.
- Добавить Preview-scope env var: Vercel требует `<gitbranch>` позиционным аргументом, а без подключённого GitHub-репо CLI отвергает запрос с `Project does not have a connected Git repository`.
- Создать Render-сервис под GitHub-репо: Render API требует предварительно установленного GitHub App и OAuth-токена, что делается только из дашборда.

Эти ограничения — со стороны платформ, обойти их без UI-шага нельзя.
