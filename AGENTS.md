# TreeTask repository instructions

## Product contract

- Интерфейс и пользовательские сообщения — на русском языке.
- Задачи выращивают структуру дерева; результаты отвечают за цветы и плоды.
- Общий прогресс при наличии результатов: 70% задачи + 30% результаты.
- Подтверждённый результат равен 100%, отправленный с доказательством — 50%; все
  остальные статусы дают 0%.
- Исходные фотографии неизменяемы. Аннотации хранятся отдельными векторами.
- Любой Canvas должен оставаться интерактивным и offline-first.

## Engineering rules

- TypeScript strict, React, Vite, TanStack Router/Query, Zustand только для
  локального UI, Zod на входных границах.
- Доменную логику держать в `packages/domain`, не дублировать формулы в UI.
- Supabase-изменения оформлять миграциями. На каждой клиентской таблице в
  exposed schema включать RLS и проверять ownership/membership, а не только
  роль `authenticated`.
- Никогда не помещать service-role key, database password или access token в
  браузерный bundle, историю Git либо вывод тестов.
- Сохранять unrelated изменения пользователя и не применять destructive Git.
- Интерактивные элементы должны иметь доступные имена, видимый focus и размер
  touch-target не менее 44x44 px.

## Required verification

Перед объявлением этапа завершённым выполнить применимые команды:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm test:e2e
pnpm build
```

Для визуальных изменений дополнительно проверить desktop, tablet и phone,
browser console и отсутствие горизонтального overflow.
