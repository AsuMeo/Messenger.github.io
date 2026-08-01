# Java → APK Компилятор

Сайт для компиляции Java кода в APK прямо из браузера.

## Архитектура
- **Фронтенд**: GitHub Pages (статический HTML)
- **Бэкенд**: Render (Docker с Android SDK)

## Деплой (без консоли на телефоне)

### Шаг 1: Создай репозиторий на GitHub
1. Открой github.com в браузере
2. Нажми "+" → "New repository"
3. Назови `android-compiler`
4. Нажми "Create repository"

### Шаг 2: Загрузи файлы через веб-интерфейс
1. В репозитории нажми "Add file" → "Upload files"
2. Загрузи: `index.html`, `Dockerfile`, `server.py`, `build_apk.py`
3. Нажми "Commit changes"

### Шаг 3: Настрой GitHub Pages
1. Settings → Pages
2. Source: Deploy from a branch → main → / (root)
3. Сохрани. Сайт будет по адресу: `https://твой_ник.github.io/android-compiler/`

### Шаг 4: Деплой бэкенда на Render
1. Зайди на render.com (регистрация через GitHub)
2. Нажми "New" → "Web Service"
3. Выбери свой репозиторий `android-compiler`
4. Настройки:
   - **Runtime**: Docker
   - **Branch**: main
   - **Plan**: Free
5. Нажми "Create Web Service"
6. Жди 5-10 минут пока соберётся Docker образ

### Шаг 5: Обнови URL в index.html
1. Когда Render даст URL (типа `https://android-compiler-api.onrender.com`)
2. Открой `index.html` на GitHub → Edit
3. Найди строку: `const RENDER_URL = "..."`
4. Вставь свой URL
5. Commit changes

## Готово!

Заходи на свой сайт, пиши Java код, жми "Собрать APK".

## Лимиты Free Render
- Спит через 15 мин бездействия (первый запрос ~30 сек)
- 512 MB RAM
- 100 GB трафика/мес
- ~4500 сборок APK в месяц

## Трафик
- Твой интернет: ~5 MB на сборку (код + APK)
- Docker образ качается на сервер Render, не с твоего интернета
