# Релизы

**Формальных релизов нет.** Push в `main` → автодеплой на Render+Vercel — это весь процесс. Никаких тегов, версий, CHANGELOG'ов, GitHub Releases инструменты не генерируют.

## Цикл одной фичи

```
push feature ветки
  │
  ├─ sync-to-dev → merge feature в dev → preview-деплой
  │
  └─ auto-pr-to-main → открывает PR feature → main
                    ↓
        review + squash merge → автодеплой в production
                    ↓
        back-merge main → dev (если на main были правки помимо PR feature)
```

## Conventional Commits — мягкое соглашение

Префиксы `feat:` / `fix:` / `chore:` / `refactor:` / `docs:` остаются в названиях PR'ов — это соглашение для читаемости истории, **не** требование инструментов. Старые коммиты без префикса нормально, никто не ругается.

Принятые префиксы:
- `feat:` новая фича
- `fix:` баг
- `perf:`, `refactor:` улучшения без user-facing изменений
- `docs:`, `ci:`, `test:` служебные
- `chore:`, `build:`, `style:` мелочи
- `feat!:` / `fix!:` / `BREAKING CHANGE:` в теле — несовместимые изменения (визуальный маркер для тебя, никаких авто-эффектов)

## Откат к предыдущему состоянию

Тегов нет → откат делается через git:

```bash
# Найти SHA коммита, на котором всё работало
git log --oneline main

# Откатить production к нему
git revert <bad-sha>      # либо аккуратный revert
git push origin main      # → автодеплой
```

Или через UI Render/Vercel: «Rollback to deployment X».

## Если когда-нибудь захочется формальных релизов

Готовый рецепт — release-please от Google:
1. Создать `release-please-config.json` с `release-type: simple` и списком файлов для version-bump'а
2. Создать `.release-please-manifest.json` с `{".": "0.X.Y"}`
3. Добавить `.github/workflows/release-please.yml` с `googleapis/release-please-action@v4`
4. На каждый push в `main` workflow открывает release-PR с обновлённым `CHANGELOG.md` и поднятой версией; merge → tag + GitHub Release

Конфиг живёт около 20 строк, добавить — 10 минут. Снято потому что на текущей стадии (личный проект, один разработчик) формальные версии не дают ценности.

## Почему это снято

| Зачем нужны формальные релизы | Применимо к проекту сейчас? |
|---|---|
| Open source: пользователи читают `CHANGELOG.md` «что нового в 0.3.0» | Нет |
| Paid product: «мы в версии X поправили баг Y» — текст для саппорта | Нет |
| Команда 5+ человек: «когда мы выкатили эту фичу в прод?» | Нет |
| Откатиться к версии «до фичи #42»: `git checkout v0.2.0` | Работает и без тегов через `git log` + SHA |

Когда хотя бы один из этих сценариев становится актуален — добавляем release-please обратно (см. выше).
