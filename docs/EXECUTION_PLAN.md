# План реализации TreeTask

Дата начала: 27 августа 2026 года. Репозиторий: `waystudia/treetask`.

## Зафиксированные решения

1. `apps/web` — responsive PWA и единственная браузерная точка входа.
2. `apps/collab` — Hocuspocus/Yjs WebSocket для высокочастотного Canvas.
3. `packages/domain` — чистые типы, формулы прогресса и shape recognition.
4. `packages/db` — pgTAP-контракт и сгенерированные типы базы.
5. Supabase хранит проекты, задачи, результаты, файлы, membership и activity;
   Canvas-документы синхронизируются как snapshots/updates, но live-жесты идут
   через collaborative server.
6. Без backend приложение работает из IndexedDB, а mutations помещаются в
   очередь для повторной отправки после восстановления сети.

## Этапы

### E0. Основа и контракты — завершён локально

- [x] Привязать Supabase project ref `imfepbeqyyjzxvixemvx`.
- [x] Перенести 10 design references.
- [x] Создать premium tree master и единый набор из 21 стадии с прозрачным alpha.
- [x] Зафиксировать `AGENTS.md`, архитектуру и критерии приёмки.
- [x] Установить pinned dependencies и получить зелёный базовый build.

### E1. Вертикальный продуктовый срез

- [x] Responsive shell: sidebar на desktop, bottom navigation на touch.
- [x] Главная, задачи, проекты, календарь, файлы и настройки.
- [x] Формулы weighted task progress/outcome progress/tree stage.
- [x] Создание и изменение задач без backend в IndexedDB.
- [x] Создание проектов и загрузка файлов offline-first; проект сразу доступен
  в форме задачи, файлы переживают reload.
- [x] Создание результата, evidence, отправка, подтверждение и отклонение.
- [x] Рабочие профили, команда по реальным membership, роли, ответственность,
  загрузка, «Поделиться», одноразовые ссылка/код и offline-first демонстрация.
- [x] Центр управления проектом: пятиэтапная воронка, назначения, WIP-лимит,
  сигналы здоровья и загрузка команды.
- [ ] Все пустые/loading/error/offline состояния (offline и ключевые empty готовы;
  единый loading/error-контракт ещё требуется).

### E2. Supabase

- [x] Reproducible migrations, RLS и private Storage policies.
- [ ] Полный authenticated CRUD с membership-проверками для всех сущностей:
  проекты, задачи, результаты, evidence, файлы и фото-аннотации уже проходят
  через offline push/pull; профиль, membership UI/очередь, защищённые
  приглашения для существующих аккаунтов и email-сценарий реализованы, но две
  новые миграции и обновлённая Edge Function ещё не применены в удалённом
  проекте. Удаление/редактирование файлов и notifications CRUD ещё требуются.
- [x] RLS-защищённый remote pull в IndexedDB и private Realtime Broadcast по
  `project:<uuid>`; локальные pending mutations не перезаписываются.
- [x] Seed для локального окружения и TypeScript database types.
- [ ] Remote database lint и advisors без warning-level замечаний (`db lint`
  зелёный после последней миграции; повторный advisor-аудит требует дать
  Supabase-коннектору доступ к этому project ref).

### E3. Canvas и аннотации

- [x] Pan/zoom 5–800%, mouse/touch/pinch.
- [x] Text, stickers, media, task cards, subprojects и freehand: карточки задачи,
  подпроекта и файла выбирают реальную доменную запись, показывают актуальные
  поля и сохраняют связь offline.
- [x] Selection/lasso, grouping, lock, layers, align и единая undo/redo-история
  объектов и strokes.
- [x] PNG/PDF export, Yjs collaboration и IndexedDB recovery.
- [x] Photo annotations как отдельные vectors + создание задачи.
- [x] Универсальная кисть: рисование только при физическом удержании, ширина,
  жёсткость, цвет, pressure и hold-to-perfect 1,1 s с threshold 0.82 и Undo.

### E4. Hardening

- [ ] Unit/component/pgTAP/Playwright/offline/two-user/a11y tests (unit, Playwright,
  offline и pgTAP-контракт готовы; локальный pgTAP требует Docker, two-user и
  полный a11y-аудит остаются).
- [ ] MacBook/tablet/phone visual QA и чистая browser console (эмуляция всех трёх
  размеров зелёная; физические устройства ещё не проверены).
- [x] GitHub Actions для lint/typecheck/unit/db/e2e/build.
- [ ] Production build и документированный release checklist (build зелёный,
  публикация и production smoke test не выполнялись).

## Проверенный срез на 28 августа 2026 года

- `pnpm lint`, `pnpm typecheck`, `pnpm test` и `pnpm build` проходят локально.
- Unit: 30 тестов проходят (domain 19, collab 2, web 9).
- Playwright: 36 сценариев проходят, 30 профильных дублей осознанно пропущены;
  проверены desktop, tablet и phone, включая профиль, реальную команду,
  шестизначный код/ссылку, главную, воронку, проекты и файлы offline-first.
- Локально статически валидируются восемь миграций и 17 таблиц с RLS. Миграции
  профилей/команды и одноразовых приглашений, а также Edge Function в удалённый
  проект не применялись.
- В удалённом Supabase применены четыре миграции; `supabase db lint --linked
  --level warning --fail-on warning` не сообщил ошибок схемы.
- Security/performance advisors были зелёными до последней точечной RLS-миграции,
  но текущий Supabase-коннектор не видит project ref `imfepbeqyyjzxvixemvx`,
  поэтому свежий advisor-отчёт пока не считается подтверждённым.
- `pnpm test:db` запущен, но не смог подключиться к локальному PostgreSQL:
  Docker на текущем Mac отсутствует, поэтому 35 pgTAP-проверок не исполнены.
- Production build проходит. Browser QA свежего build выполнена при 1440×900,
  834×1112 и 390×844: overflow и console errors не обнаружены; touch-targets
  главной, приглашения и управления WIP подтверждены как 44×44 px или больше.
- Production deployment, физические устройства и реальный сеанс двух
  одновременных пользователей пока не являются подтверждёнными результатами.

## Definition of done

Этап завершён только при выполнении его пунктов и соответствующих проверок из
`docs/ACCEPTANCE_TESTS.md`. Mock, локальная проверка, CI и production являются
разными уровнями доказательства и не подменяют друг друга.
