# Деплой Planning Poker: Vercel (frontend) + Railway (backend)

Полный гайд со всеми кликами. Время: ~25 минут.

---

## Что мы делаем

1. **Backend (FastAPI + WebSocket)** → Railway, потому что нужен долгоживущий
   процесс, поддержка WebSocket и in-memory state.
2. **Frontend (React + Vite)** → Vercel, потому что это статика, бесплатно
   и быстро.
3. Связываем их через переменные окружения (URL бэка во фронте, домен фронта
   в CORS бэка).

---

## Подготовка: обновлённый код

В архиве `planning-poker.zip` уже внесены все правки для деплоя:

- `frontend/src/hooks/useRoomSocket.ts` — берёт URL бэка из `VITE_API_URL`
- `frontend/src/pages/Home.tsx` — тоже использует `VITE_API_URL`
- `frontend/src/vite-env.d.ts` — типы для env-переменных
- `frontend/vercel.json` — конфиг сборки
- `frontend/.env.example` — пример env-файла
- `backend/app/main.py` — CORS читает из `CORS_ORIGINS`
- `backend/railway.toml` — конфиг Railway
- `backend/nixpacks.toml` — указывает Python 3.12
- `backend/Procfile` — запасная команда запуска

**Если репо уже на GitHub** — перекачайте новый zip, замените файлы и
запушьте обновления:

```bash
# В Termux:
cd ~
rm -rf planning-poker-old
mv planning-poker planning-poker-old
unzip ~/storage/downloads/planning-poker.zip
# скопируйте .git из старой папки
mv planning-poker-old/.git planning-poker/.git
cd planning-poker
git add .
git commit -m "Add deploy configs for Vercel + Railway"
git push
```

---

## Часть 1. Деплой Backend на Railway

### Шаг 1.1. Регистрация в Railway

1. Откройте https://railway.app
2. Нажмите **Login** (или **Start a New Project**)
3. Выберите **Login with GitHub** — Railway откроет окно авторизации
4. Подтвердите доступ Railway к вашему GitHub-аккаунту
5. После входа окажетесь на главной странице — Dashboard

**На бесплатном тире:** $5 кредитов в месяц. Для нашего бэка с одной комнатой
этого хватит на ~500 часов работы. Если карта потребуется для верификации —
привяжите, списания не будет, пока не превысите лимит.

### Шаг 1.2. Создание проекта из GitHub

1. На Dashboard нажмите **+ New Project**
2. Выберите **Deploy from GitHub repo**
3. Если репо `planning-poker` не виден — нажмите **Configure GitHub App**
4. В открывшемся GitHub: разрешите Railway доступ к репо `planning-poker`
   (можно выбрать только этот, не все)
5. Вернитесь в Railway, кликните по `planning-poker` в списке

### Шаг 1.3. Указать, что деплоим только backend

Railway по умолчанию попробует собрать корень репо — но у нас там и `backend/`,
и `frontend/`. Нужно указать **Root Directory**.

1. После создания проекта откроется страница с одним сервисом — кликните по
   карточке сервиса (она называется по имени репо)
2. Перейдите на вкладку **Settings**
3. Найдите секцию **Source** → поле **Root Directory**
4. Введите: `backend`
5. Нажмите **Update** (или галочка рядом с полем)
6. Railway автоматически запустит передеплой — следите за вкладкой **Deployments**

### Шаг 1.4. Сгенерировать публичный URL

По умолчанию Railway даёт только внутренний URL. Нужен публичный домен.

1. На вкладке **Settings** найдите секцию **Networking** → **Public Networking**
2. Нажмите **Generate Domain**
3. Появится URL вида `planning-poker-production-XXXX.up.railway.app`
4. **Скопируйте этот URL** — он нужен для фронта (Часть 2)

### Шаг 1.5. Проверить, что бэкенд жив

В браузере на телефоне откройте:
```
https://ваш-railway-url.up.railway.app/healthz
```

Должны увидеть: `{"status":"ok"}`

Если получили **502 / Application failed to respond:**
- Откройте вкладку **Deployments** → последний деплой → **View Logs**
- Скиньте мне логи, разберёмся (типичные причины: не та root directory, ошибка
  в импортах, не установился uvicorn)

### Шаг 1.6. Пока запомним URL

Скопированный URL вида `https://planning-poker-production-XXXX.up.railway.app`
понадобится в Части 2 как значение `VITE_API_URL`.

---

## Часть 2. Деплой Frontend на Vercel

### Шаг 2.1. Импорт проекта

1. Откройте https://vercel.com → войдите через GitHub (если ещё нет)
2. Dashboard → **Add New** → **Project**
3. В списке репо найдите `planning-poker` → **Import**
4. Если репо не виден — кнопка **Adjust GitHub App Permissions**, дайте
   Vercel доступ к `planning-poker`

### Шаг 2.2. Настройка сборки

На экране Configure Project:

1. **Framework Preset** должен автоопределиться как **Vite**
   (если нет — выберите вручную)
2. **Root Directory** → нажмите **Edit** рядом → выберите `frontend`
3. Build Command, Output Directory, Install Command — оставьте дефолт,
   `vercel.json` в `frontend/` всё уже указывает

### Шаг 2.3. Добавить переменную окружения

Прямо на этом же экране:

1. Раскройте секцию **Environment Variables**
2. Добавьте:
   - **Key:** `VITE_API_URL`
   - **Value:** URL Railway из шага 1.4, например
     `https://planning-poker-production-XXXX.up.railway.app`
   - **Environments:** галочки на Production, Preview, Development
3. Нажмите **Add**

### Шаг 2.4. Деплой

1. Жмите большую кнопку **Deploy**
2. Подождите 1-2 минуты — Vercel соберёт и задеплоит
3. Когда увидите конфетти 🎉 — нажмите **Continue to Dashboard** или
   **Visit** (или сам preview URL)
4. URL вида `planning-poker-XXXX.vercel.app` — **скопируйте**, нужен в Части 3

---

## Часть 3. Связать фронт и бэк (CORS)

Сейчас бэк не примет запросы с Vercel — CORS не разрешает домен фронта.

### Шаг 3.1. Прописать домен Vercel в Railway

1. Откройте Railway → проект `planning-poker` → сервис
2. Перейдите на вкладку **Variables**
3. Нажмите **+ New Variable**
4. Введите:
   - **Name:** `CORS_ORIGINS`
   - **Value:** ваш URL Vercel **со схемой и без слэша в конце**,
     например `https://planning-poker-xxxx.vercel.app`
5. Нажмите **Add**
6. Railway автоматически перезапустит сервис — подождите ~30 сек

**Если у вас несколько Vercel-доменов** (production + preview),
разделяйте запятыми без пробелов:
```
https://planning-poker.vercel.app,https://planning-poker-xxxx.vercel.app
```

### Шаг 3.2. Проверка работы

1. Откройте ваш Vercel-URL в браузере на телефоне
2. Введите ник и название комнаты → **Start new game**
3. Должна открыться комната с пустым списком игроков (вы один)
4. Скопируйте URL комнаты, откройте в другом браузере / на другом устройстве,
   введите другой ник → должны увидеть друг друга в списке игроков

---

## Часть 4. Если что-то пошло не так

### Бэк не отвечает на /healthz

**Симптом:** 502, 503, "Application failed to respond"

**Диагностика:** Railway → проект → сервис → Deployments → последний деплой → View Logs.

Типичные ошибки в логах:
- `ModuleNotFoundError: No module named 'app'` → Root Directory не `backend`,
  проверьте Settings → Source
- `pip: command not found` → nixpacks не подхватил Python; проверьте, что
  `requirements.txt` лежит в `backend/`
- `Address already in use` → переменная `$PORT` не подставилась; Railway
  обычно ставит её автоматом, проверьте Variables на наличие `PORT`

### Фронт открылся, но Start new game не работает

**Симптом:** Спиннер крутится, потом ошибка "Failed to create room" / "Failed to fetch"

**Диагностика:** На странице Vercel-проекта → DevTools (если на ПК) или
посмотрите Network в браузере мобильно.

- **404 Not Found на /api/rooms** → `VITE_API_URL` не подставился. Проверьте
  Vercel → Settings → Environment Variables. После изменения нужно **передеплоить**:
  Deployments → последний → ⋮ → Redeploy.
- **CORS error** → Railway → Variables → `CORS_ORIGINS` не содержит ваш
  Vercel-домен. Проверьте написание (со схемой `https://`, без слэша в конце).
- **NetworkError / ERR_CONNECTION_REFUSED** → Railway-URL не отвечает,
  см. предыдущий пункт.

### Комната открылась, но WebSocket падает

**Симптом:** "reconnecting…" в углу, не приходит room_state

**Диагностика:** WebSocket идёт на тот же URL, что и REST. Если REST работает,
а WS нет — это редкость. Чаще всего:

- Railway бесплатный тир: первый запрос после простоя долгий (cold start),
  ws не успевает за timeout. Подождите 30 сек, страница перезагрузится.
- Браузер блокирует mixed content: фронт по https, ws должен быть на wss.
  В коде уже стоит проверка протокола, но проверьте, что `VITE_API_URL`
  именно с `https://`, а не `http://`.

### Игроки не видят друг друга

**Симптом:** Два устройства зашли в одну комнату, но видят только себя

Скорее всего, WebSocket не подключился (см. предыдущий пункт), либо вы
используете два разных Vercel-домена (production и preview). Каждый Vercel
preview-деплой имеет свой URL — комната, созданная на одном, не видна с другого.

Решение: используйте только production-URL `https://planning-poker.vercel.app`,
а не preview.

---

## Часть 5. Custom-домен (опционально)

Если хотите свой домен типа `poker.team.com`:

**На Vercel:**
1. Settings → Domains → Add
2. Введите домен → Vercel покажет DNS-записи (CNAME)
3. У регистратора домена добавьте эти записи
4. Подождите ~10 минут — SSL-сертификат выпустится автоматически

**На Railway** (если хотите custom-домен для бэка тоже):
1. Settings → Networking → Custom Domain
2. Введите `api.team.com` → получите CNAME
3. Добавьте у регистратора
4. **Не забудьте** обновить `VITE_API_URL` на Vercel на новый URL и
   `CORS_ORIGINS` на Railway тоже

---

## Часть 6. Финальный чек-лист

После успешного деплоя должно быть так:

- [ ] `https://your-railway.up.railway.app/healthz` → `{"status":"ok"}`
- [ ] `https://your-app.vercel.app` открывается, видна форма создания игры
- [ ] Создание комнаты возвращает страницу с пустым списком игроков
- [ ] Второе устройство по той же ссылке появляется в списке игроков
- [ ] Голосование, reveal, reset работают
- [ ] При закрытии вкладки игрок становится серым, через 30 сек удаляется

Если хотя бы один пункт не работает — пришлите конкретный симптом, разберёмся.

---

## Часть 7. Что дальше

**Стоимость прода:**
- Vercel: бесплатно навсегда для личных проектов
- Railway: $5 в месяц кредитов бесплатно, нашему бэку этого хватит при
  умеренном использовании. Если перерасход — будут списания с привязанной карты.

**Когда понадобится Redis** (если решите масштабировать):
1. Railway → + New → Database → Redis
2. Скопируйте `REDIS_URL` из переменных нового сервиса
3. В коде замените `InMemoryRoomStore` на `RedisRoomStore`
   (нужно дописать класс, около 50 строк)
4. Добавьте `REDIS_URL` в переменные backend-сервиса

**Когда появится несколько подов** (горизонтальное масштабирование):
- Перейти с in-process broadcast на Redis pub/sub
- Это правки в `ws_manager.py`

Эти доработки не нужны сейчас — для внутреннего инструмента команды текущей
архитектуры хватит надолго.
