# TreeTask MCP

MCP-сервер позволяет ChatGPT и Codex работать с Canvas TreeTask как с редактируемым инструментом: выбрать проект, прочитать узлы, создать связанную карту, изменить узел и удалить выбранные элементы.

## Инструменты

- `list_projects` — доступные пользователю проекты;
- `get_canvas` — актуальный снимок и стабильные ID узлов;
- `create_canvas_nodes` — пакетное создание карточек, текста и фигур со связями;
- `update_canvas_node` — текст, позиция, размер, цвет, заметка и родитель;
- `delete_canvas_nodes` — подтверждаемое удаление узлов и их потомков.

Все обращения выполняются с JWT вошедшего пользователя. Доступ ограничивается существующими RLS-политиками `canvas_documents` и `projects`; service-role ключ серверу не нужен.

## Локальная проверка

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_PUBLISHABLE_KEY=<publishable-key> \
MCP_PUBLIC_URL=http://127.0.0.1:3333 \
pnpm --filter @treetask/mcp dev
```

Healthcheck: `GET http://127.0.0.1:3333/health`. MCP endpoint: `POST http://127.0.0.1:3333/mcp`.

Для stdio задайте `MCP_TRANSPORT=stdio` и короткоживущий `TREETASK_ACCESS_TOKEN`. Не сохраняйте токен в Git.

## Подключение ChatGPT

1. Разместите сервер на стабильном публичном HTTPS URL и задайте его в `MCP_PUBLIC_URL`.
2. В Supabase откройте **Authentication → OAuth Server**, включите OAuth 2.1 и dynamic client registration.
3. Укажите Site URL `https://waystudia.github.io/treetask/` и Authorization Path `/oauth/consent`.
4. В ChatGPT включите Developer Mode, создайте приложение и укажите `https://<mcp-host>/mcp`.

MCP публикует `/.well-known/oauth-protected-resource`, а Supabase выдаёт пользовательские OAuth-токены. Экран согласия находится в TreeTask по адресу `/oauth/consent`.
