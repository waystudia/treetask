# Архитектура

## Границы данных

```text
React UI -> domain commands -> TanStack Query -> repository adapter
                                            |-> IndexedDB/offline queue
                                            |-> Supabase PostgREST/Storage

Canvas UI -> Y.Doc -> IndexedDB persistence -> Hocuspocus WebSocket
                                 snapshots -> Supabase canvas_documents
```

Supabase остаётся источником истины для доменных объектов. Zustand не хранит
серверные сущности: только active tool, открытые панели, selection и viewport.

После подтверждения Auth-сессии клиент получает доступные по RLS проекты,
задачи, checklist, результаты, evidence, файлы и membership, затем атомарно
upsert-ит их в IndexedDB. Записи с незавершённой mutation-очередью remote pull
не перезаписывает. Изменения базы публикуются через private Realtime Broadcast
в membership-защищённый topic `project:<uuid>`; периодический pull остаётся
fallback после разрыва WebSocket.

## Прогресс

Для задачи нормализованный вклад равен `weight * completion / weightTotal`.
Checklist вычисляется по отмеченным пунктам, binary — 0/100, manual — заданный
процент. При отсутствии активных задач прогресс задач равен 0.

Для результата: `submitted` даёт 50 только с доказательством, `confirmed` —
100, остальные состояния — 0. Если результатов нет, общий процент равен
прогрессу задач. Иначе используется отношение 70/30.

## Security model

- Доступ к проекту определяется записью `project_members`, owner не является
  обходным путём вне этой модели.
- RLS policy на дочерних сущностях проверяет membership конкретного project id.
- Изменить role/membership может только owner/admin, подтверждать результат —
  owner/admin/reviewer.
- Storage object path начинается с project UUID; policies извлекают его и
  повторяют membership check.
- Signed URLs выдаются только серверным доверенным кодом.
