# TreeTask

TreeTask — русскоязычная offline-first PWA для управления проектами, задачами,
измеримыми результатами и совместным Canvas. Выполненная работа выращивает
дерево, а подтверждённые результаты добавляют цветы и плоды.

## Быстрый старт

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Веб-приложение откроется на `http://localhost:5173`. Без переменных Supabase
оно запускается в локальном демонстрационном режиме и хранит изменения в
IndexedDB. Архитектурный план находится в `docs/EXECUTION_PLAN.md`.

## Проверки

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm test:e2e
pnpm build
```

## Безопасность

В клиентском коде допустимы только `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY` и `VITE_COLLAB_WS_URL`. Никогда не добавляйте
в репозиторий database password, access token или service-role key.
