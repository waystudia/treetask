import { expect, test, type Page } from "@playwright/test";

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("основные экраны адаптивны и консоль чистая", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/");
  const greeting = page.locator(".dashboard-heading h1");
  await expect(greeting).toHaveText(/^(Доброе утро|Добрый день|Добрый вечер|Доброй ночи)$/);
  await expect(greeting).not.toContainText("Магомед");
  await expect(page.getByLabel(/Общий прогресс по всем задачам и результатам/)).toContainText(/из \d+ задач выполнено/);
  await expect(page.getByRole("img", { name: /Зелёное дерево/ })).toHaveAccessibleName(
    /стадия \d+ из 20, рост по задачам \d+%, общий прогресс \d+%/,
  );
  await expect(page.getByRole("img", { name: /Начальное дерево проекта/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Конечное дерево проекта/ })).toBeVisible();
  const frames = page.locator(".tree-card .tree-stage-preview");
  await expect(frames).toHaveCount(3);
  const widths = await frames.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width));
  expect(widths[0]).toBeLessThan(widths[1] ?? 0);
  expect(widths[1]).toBeLessThan(widths[2] ?? 0);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test("плавающий плюс сразу открывает компактное создание задачи", async ({ page }) => {
  test.skip(test.info().project.name !== "phone", "Плавающий плюс показывается в мобильной компоновке");
  const errors = watchConsole(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Создать задачу" }).click();
  const dialog = page.getByRole("dialog", { name: "Новая задача" });
  await expect(dialog.getByLabel("Название")).toBeFocused();
  await expect(dialog.getByText("Дополнительно", { exact: true })).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(dialogBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (dialogBox && viewport) expect(dialogBox.height).toBeLessThanOrEqual(viewport.height - 20);
  expect(errors).toEqual([]);
});

test("вход в проект скрыт с главной и доступен внутри Команды", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Вступить в проект" })).toHaveCount(0);
  await page.goto("/team");
  const panel = page.locator(".team-join-panel > summary");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Вступить в проект");
  await panel.click();
  await expect(page.getByRole("heading", { name: "Вступить в проект" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("доски доступны из навигации, а масштаб страницы зафиксирован", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/boards");
  await expect(page.getByRole("heading", { name: "Доски" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /WayYaam/ })).toBeVisible();
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).toContain("maximum-scale=1");
  expect(viewport).toContain("user-scalable=no");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test("плавающие панели Canvas закрываются предсказуемо, а кисть остаётся доступной", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Поведение панелей достаточно проверить один раз");
  const errors = watchConsole(page);
  await page.goto("/project/wayyaam/canvas");
  await page.getByRole("button", { name: "Ещё объекты" }).click();
  await expect(page.getByRole("menu", { name: "Добавить объект" })).toBeVisible();
  await page.locator(".canvas-workspace canvas").first().click({ position: { x: 500, y: 300 } });
  await expect(page.getByRole("menu", { name: "Добавить объект" })).toBeHidden();
  await page.getByRole("button", { name: "Ещё объекты" }).click();
  await page.getByRole("button", { name: "Рисование" }).click();
  await expect(page.getByRole("menu", { name: "Добавить объект" })).toBeHidden();
  await expect(page.getByRole("complementary", { name: "Параметры кисти" })).toBeVisible();
  await page.locator(".canvas-workspace canvas").first().click({ position: { x: 700, y: 400 } });
  await expect(page.getByRole("complementary", { name: "Параметры кисти" })).toBeVisible();
  await page.getByRole("button", { name: "Рисование" }).click();
  await expect(page.getByRole("complementary", { name: "Параметры кисти" })).toBeHidden();
  expect(errors).toEqual([]);
});

test("панели дизайна и кисти помещаются в Canvas без горизонтального overflow", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/project/wayyaam/canvas");
  await page.getByRole("button", { name: "Дизайн" }).click();
  const designPanel = page.getByRole("complementary", { name: "Дизайн интеллект-карты" });
  const designBox = await designPanel.boundingBox();
  const viewport = page.viewportSize();
  expect(designBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (designBox && viewport) {
    expect(designBox.x).toBeGreaterThanOrEqual(0);
    expect(designBox.x + designBox.width).toBeLessThanOrEqual(viewport.width);
    expect(designBox.y + designBox.height).toBeLessThanOrEqual(viewport.height);
  }
  await page.getByRole("button", { name: "Закрыть дизайн" }).click();
  await page.getByRole("button", { name: "Рисование" }).click();
  const brushPanel = page.getByRole("complementary", { name: "Параметры кисти" });
  const brushBox = await brushPanel.boundingBox();
  const workspaceBox = await page.locator(".canvas-workspace").boundingBox();
  expect(brushBox).not.toBeNull();
  expect(workspaceBox).not.toBeNull();
  if (brushBox && viewport && workspaceBox) {
    expect(brushBox.x + brushBox.width).toBeLessThanOrEqual(viewport.width);
    expect(brushBox.x).toBeLessThan(workspaceBox.x + workspaceBox.width / 2);
    expect(brushBox.y + brushBox.height).toBeGreaterThan(workspaceBox.y + workspaceBox.height / 2);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test("пользователь может удалить локальные данные", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Удаление локальных данных достаточно проверить один раз");
  const errors = watchConsole(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: /Очистить это устройство/ }).click();
  const dialog = page.getByRole("dialog", { name: "Удалить данные с устройства?" });
  await dialog.getByLabel("Введите «УДАЛИТЬ»").fill("УДАЛИТЬ");
  await dialog.getByRole("button", { name: "Удалить локально" }).click();
  await expect(page.getByText("Локальные данные удалены")).toBeVisible();
  await page.goto("/boards");
  await expect(page.getByRole("heading", { name: "Создайте первую доску" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("задача сохраняется в IndexedDB и переживает reload", async ({ page }) => {
  const errors = watchConsole(page);
  const title = `Offline задача ${test.info().project.name}`;
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Новая задача" }).click();
  const titleInput = page.getByLabel("Название задачи");
  await expect(titleInput).toBeFocused();
  await titleInput.fill(title);
  await titleInput.press("Enter");
  await expect(page.locator(".task-card").getByText(title, { exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  const undersizedControls = await page.locator(".task-card button, .task-card select, .task-card input:not(.sr-only)").evaluateAll((elements) => elements.filter((element) => {
    const bounds = element.getBoundingClientRect();
    const visible = bounds.width > 0 && bounds.height > 0;
    return visible && (bounds.width < 44 || bounds.height < 44);
  }).length);
  expect(undersizedControls).toBe(0);
  await page.reload();
  const restoredCard = page.locator(".task-card").filter({ hasText: title });
  await expect(restoredCard.getByText(title, { exact: true })).toBeVisible();
  await restoredCard.getByRole("button", { name: `Переименовать задачу ${title}` }).click();
  const restoredTitleInput = page.getByLabel("Название задачи");
  await expect(restoredTitleInput).toBeFocused();
  await restoredTitleInput.fill(`${title} обновлена`);
  await restoredTitleInput.press("Enter");
  await expect(page.locator(".task-card").getByText(`${title} обновлена`, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("мобильные задачи компактны, а меню сохраняет понятную иерархию", async ({ page }) => {
  test.skip(test.info().project.name !== "phone", "Мобильную компоновку достаточно проверить в phone-профиле");
  const errors = watchConsole(page);
  await page.goto("/tasks");

  await expect(page.getByRole("region", { name: "Область и проект" })).toBeVisible();
  await page.locator(".task-context-switcher select").nth(0).selectOption({ label: "Продукты" });
  await page.locator(".task-context-switcher select").nth(1).selectOption({ label: "WayYaam" });

  const card = page.locator(".task-card").filter({ hasText: "Настройка API" });
  const collapsedBox = await card.boundingBox();
  expect(collapsedBox).not.toBeNull();
  expect(collapsedBox?.height).toBeLessThanOrEqual(72);
  await expect(card.getByLabel("Исполнитель: Магомед. Дедлайн: 14:00")).toBeVisible();
  await expect(card.getByLabel("Проект задачи Настройка API")).toBeHidden();
  await expect(card.getByRole("button", { name: /Дедлайн задачи Настройка API/ })).toBeHidden();

  await card.getByRole("button", { name: "Открыть задачу Настройка API" }).click();
  await expect(card.getByLabel("Проект задачи Настройка API")).toBeVisible();
  await expect(card.getByRole("button", { name: /Дедлайн задачи Настройка API/ })).toBeVisible();

  await page.getByRole("button", { name: "Открыть меню" }).click();
  const sidebar = page.getByRole("complementary", { name: "Основная навигация" });
  await expect(sidebar.getByText("TreeTask", { exact: true })).toHaveCount(1);
  await expect(sidebar.getByText("Моё пространство", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("Проекты", { exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Создать рабочее пространство" })).toBeVisible();
  await expect(sidebar.getByRole("region", { name: "Личное" })).toBeVisible();
  await expect(sidebar.getByRole("region", { name: "Командное" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test("карточка задачи хранит описание, исполнителя, дедлайн и файл", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Расширенные данные задачи достаточно проверить один раз");
  const errors = watchConsole(page);
  await page.goto("/tasks");
  const card = page.locator(".task-card").filter({ hasText: "Настройка API" });
  await card.getByRole("button", { name: "Переименовать задачу Настройка API" }).click();
  const titleInput = page.getByLabel("Название задачи");
  await expect(titleInput).toBeFocused();
  await titleInput.fill("Настройка API и авторизации");
  await titleInput.press("Enter");
  const renamedCard = page.locator(".task-card").filter({ hasText: "Настройка API и авторизации" });
  await expect(renamedCard.getByText("Настройка API и авторизации", { exact: true })).toBeVisible();
  await renamedCard.getByRole("button", { name: "Открыть задачу Настройка API и авторизации" }).click();
  await renamedCard.getByLabel("Описание").fill("Проверить интеграцию и обработку ошибок API");
  await renamedCard.getByLabel("Передать задачу").selectOption({ label: "Анна" });
  await renamedCard.locator('input[type="file"]').setInputFiles({ name: "api-note.txt", mimeType: "text/plain", buffer: Buffer.from("API checklist") });
  await expect(renamedCard.getByText("api-note.txt")).toBeVisible();
  await renamedCard.getByRole("button", { name: /Открепить файл/ }).focus();
  await page.reload();
  const restored = page.locator(".task-card").filter({ hasText: "Настройка API и авторизации" });
  await restored.getByRole("button", { name: "Открыть задачу Настройка API и авторизации" }).click();
  await expect(restored.getByLabel("Описание")).toHaveValue("Проверить интеграцию и обработку ошибок API");
  await expect(restored.getByLabel("Передать задачу")).toHaveValue("local:anna");
  await expect(restored.getByText("api-note.txt")).toBeVisible();
  expect(errors).toEqual([]);
});

test("профиль и реальная команда сохраняются offline-first", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Командный CRUD достаточно проверить один раз");
  const errors = watchConsole(page);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Мой профиль" })).toBeVisible();
  await page.getByLabel("Рабочая роль").fill("Руководитель продуктовой команды");
  await page.getByLabel("Навыки через запятую").fill("Стратегия, Приоритеты, Переговоры");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Профиль сохранён и будет синхронизирован при подключении")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Рабочая роль")).toHaveValue("Руководитель продуктовой команды");

  await page.goto("/team");
  await page.locator(".team-toolbar .project-filter select").selectOption("wayyaam");
  await page.getByRole("button", { name: "Поделиться" }).click();
  const shareDialog = page.getByRole("dialog", { name: /Поделиться/ });
  await shareDialog.getByRole("button", { name: /Пригласить по email/ }).click();
  const dialog = page.getByRole("dialog", { name: /Пригласить в/ });
  await dialog.getByLabel("Email").fill("amina@example.test");
  await dialog.getByLabel("Имя").fill("Амина Сулейманова");
  await dialog.getByLabel("Зона ответственности").fill("Исследования пользователей");
  await dialog.getByRole("button", { name: "Добавить в команду" }).click();
  await expect(page.getByText("Амина Сулейманова", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("ссылка и шестизначный код ведут на главную и подключают команду", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Полный сценарий приглашения достаточно проверить один раз");
  const errors = watchConsole(page);
  await page.goto("/team");
  await page.locator(".team-toolbar .project-filter select").selectOption("wayyaam");
  await page.getByRole("button", { name: "Поделиться" }).click();
  const dialog = page.getByRole("dialog", { name: /Поделиться/ });
  await dialog.getByLabel("Зона ответственности").fill("Работа с задачами команды");
  await dialog.getByRole("button", { name: /Создать код и ссылку/ }).click();
  await expect(dialog.getByRole("heading", { name: "Приглашение готово" })).toBeVisible();
  const codeLabel = await dialog.locator(".invite-code").textContent();
  const code = codeLabel?.replace(/\D/g, "") ?? "";
  expect(code).toMatch(/^\d{6}$/);
  await dialog.getByRole("button", { name: "Копировать ссылку" }).click();
  await expect(dialog.getByText("Ссылка скопирована")).toBeVisible();
  await dialog.getByRole("button", { name: "Готово" }).click();

  await page.goto(`/?join=${code}`);
  await expect(page.getByRole("heading", { name: "Вступить в проект" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/team\\?join=${code}`));
  await expect(page.getByLabel("Код приглашения")).toHaveValue(code);
  await expect(page.getByText(/получен из ссылки/)).toBeVisible();
  await page.getByRole("button", { name: "Вступить" }).click();
  await expect(page.getByText("Вы уже состоите в команде проекта «WayYaam»")).toBeVisible();
  await expect(page.getByRole("link", { name: /Открыть проект/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test("профиль и команда адаптивны на всех размерах", async ({ page }) => {
  const errors = watchConsole(page);
  for (const route of ["/profile", "/team"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: route === "/profile" ? "Мой профиль" : "Команда" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  }
  expect(errors).toEqual([]);
});

test("центр управления показывает адаптивную воронку задач", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/project/wayyaam/control");
  await expect(page.getByRole("heading", { name: "WayYaam" })).toBeVisible();
  for (const stage of ["Входящие", "Запланировано", "В работе", "Заблокировано", "Готово"]) {
    await expect(page.getByRole("heading", { name: stage })).toBeVisible();
  }
  const task = page.locator(".funnel-task").filter({ hasText: "Обсуждение с командой" });
  await task.getByRole("button", { name: /переместить задачу Обсуждение с командой вперёд/i }).click();
  await expect(page.locator(".funnel-column.active")).toContainText("Обсуждение с командой");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  const undersizedControls = await page.locator(".wip-control input, .wip-control button, .project-team-control .text-button").evaluateAll((elements) => elements.filter((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.width < 44 || bounds.height < 44;
  }).length);
  expect(undersizedControls).toBe(0);
  await expect(page.getByRole("button", { name: "Создать задачу" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("проект создаётся offline и доступен при создании задачи", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "CRUD-сценарий достаточно проверить один раз");
  const errors = watchConsole(page);
  const projectTitle = "Новый продукт";
  const taskTitle = "Проверить гипотезу";
  await page.goto("/projects");
  await page.getByRole("main").getByRole("button", { name: "Новый проект", exact: true }).click();
  const projectDialog = page.getByRole("dialog", { name: "Новый проект" });
  await projectDialog.getByLabel("Название").fill(projectTitle);
  await projectDialog.getByText("Дополнительно", { exact: true }).click();
  await projectDialog.getByLabel("Описание").fill("Проверка полного CRUD-контура");
  await projectDialog.getByRole("button", { name: "Создать проект" }).click();
  await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();

  await page.goto("/tasks");
  await page.getByRole("button", { name: "Новая задача" }).click();
  const titleInput = page.getByLabel("Название задачи");
  await titleInput.fill(taskTitle);
  await titleInput.press("Enter");
  const taskCard = page.locator(".task-card").filter({ hasText: taskTitle });
  await taskCard.getByLabel(`Проект задачи ${taskTitle}`).selectOption({ label: projectTitle });
  await expect(taskCard.getByText(taskTitle, { exact: true })).toBeVisible();
  await expect(taskCard.getByLabel(`Проект задачи ${taskTitle}`).locator("option:checked")).toHaveText(projectTitle);
  await page.reload();
  await expect(page.locator(".task-card").getByText(taskTitle, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("личный проект сохраняет только выбранные рабочие разделы", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Настройку пространства достаточно проверить один раз");
  const errors = watchConsole(page);
  const title = "Личный запуск";
  await page.goto("/projects");
  await page.getByRole("main").getByRole("button", { name: "Новый проект", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Новый проект" });
  const dialogBox = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(dialogBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (dialogBox && viewport) expect(dialogBox.height).toBeLessThanOrEqual(viewport.height - 20);
  await dialog.getByRole("radio", { name: /Личный/ }).check();
  await dialog.getByText("Дополнительно", { exact: true }).click();
  await dialog.getByRole("checkbox", { name: /Холст/ }).uncheck();
  await dialog.getByRole("checkbox", { name: /Календарь/ }).uncheck();
  await dialog.getByLabel("Название").fill(title);
  await dialog.getByRole("button", { name: "Создать проект" }).click();

  const personal = page.getByRole("region", { name: "Личное" });
  await expect(personal.getByRole("link", { name: title, exact: true })).toBeVisible();
  await personal.getByRole("link", { name: title, exact: true }).click();
  const tabs = page.getByRole("navigation", { name: `Разделы проекта ${title}` });
  await expect(tabs.getByRole("link", { name: "Обзор" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Задачи" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Холст" })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: "Календарь" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("задача проекта получает исполнителя и появляется в календаре", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Связь задачи и календаря достаточно проверить один раз");
  const errors = watchConsole(page);
  const title = "Согласовать интерфейс";
  const dueDate = new Date().toISOString().slice(0, 10);
  await page.goto("/project/wayyaam/tasks");
  await page.getByRole("button", { name: "Добавить задачу", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Новая задача" });
  await dialog.getByLabel("Название").fill(title);
  await dialog.getByText("Дополнительно", { exact: true }).click();
  await dialog.getByLabel("Исполнитель").selectOption({ label: "Анна" });
  await dialog.getByLabel("Дата").fill(dueDate);
  await dialog.getByLabel("Срок").fill("19:30");
  await dialog.getByRole("button", { name: "Создать задачу" }).click();
  const row = page.locator(".task-card").filter({ hasText: title });
  await expect(row).toContainText("19:30");
  await row.getByRole("button", { name: `Открыть задачу ${title}` }).click();
  await expect(row.getByLabel("Передать задачу")).toHaveValue("local:anna");

  await page.goto("/project/wayyaam/calendar");
  await expect(page.locator(".workspace-agenda-list").getByText(title)).toBeVisible();
  expect(errors).toEqual([]);
});

test("область содержит проект, задачи и готовый контекст для ChatGPT", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Иерархический CRUD достаточно проверить один раз");
  const errors = watchConsole(page);
  const areaTitle = "Рабочие продукты";
  const projectTitle = "Новый сервис";
  await page.goto("/projects");
  await page.getByRole("button", { name: "Новая область" }).click();
  const areaDialog = page.getByRole("dialog", { name: "Соберите связанные проекты" });
  await areaDialog.getByLabel("Название").fill(areaTitle);
  await areaDialog.getByLabel("Описание").fill("Запуски и развитие цифровых продуктов");
  await areaDialog.getByRole("button", { name: "Создать область" }).click();
  await expect(page.getByRole("heading", { name: areaTitle })).toBeVisible();

  await page.getByRole("button", { name: `Добавить проект в область ${areaTitle}` }).click();
  const projectDialog = page.getByRole("dialog", { name: "Новый проект" });
  await expect(projectDialog.getByLabel("Область")).toHaveValue(/.+/);
  await projectDialog.getByLabel("Название").fill(projectTitle);
  await projectDialog.getByText("Дополнительно", { exact: true }).click();
  await projectDialog.getByLabel("Описание").fill("Проверяем понятный путь от области к задачам");
  await projectDialog.getByLabel("Цель").fill("Выпустить проверенный MVP");
  await projectDialog.getByRole("button", { name: "Создать проект" }).click();
  await page.getByRole("main").getByRole("link", { name: new RegExp(projectTitle) }).click();
  await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();
  await page.getByLabel("Текущий этап").fill("Проверка MVP");
  await page.getByLabel("План и следующие шаги").fill("Проверить сценарии\nСобрать обратную связь\nПодготовить выпуск");
  await page.getByRole("button", { name: "Сохранить контекст" }).click();
  await expect(page.getByText("Контекст проекта сохранён")).toBeVisible();
  await page.getByRole("button", { name: "Передать в ChatGPT" }).click();
  const shareDialog = page.getByRole("dialog", { name: "Передать контекст в ChatGPT" });
  await expect(shareDialog.getByLabel("Готовый контекст")).toHaveValue(new RegExp(`Область: ${areaTitle}`));
  await expect(shareDialog.getByLabel("Готовый контекст")).toHaveValue(/Текущий этап: Проверка MVP/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test("файл сохраняется offline и переживает reload", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Файловый CRUD достаточно проверить один раз");
  const errors = watchConsole(page);
  await page.goto("/files");
  await page.locator('.page-action input[type="file"]').setInputFiles("public/tree-icon.svg");
  await expect(page.getByText("tree-icon.svg")).toBeVisible();
  await expect(page.locator(".inline-notice")).toContainText("Файл сохранён на устройстве");
  await page.reload();
  await expect(page.getByText("tree-icon.svg")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Canvas сразу отрисовывает объекты и ограничивает zoom", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/project/wayyaam/canvas");
  const canvas = page.locator(".canvas-workspace canvas").first();
  await expect(canvas).toBeVisible();
  await expect(page.getByText("Сохранено на устройстве")).toHaveText("Сохранено на устройстве");
  await expect.poll(async () => canvas.evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext("2d");
    if (!context) return false;
    const { width, height } = element as HTMLCanvasElement;
    const pixels = context.getImageData(0, 0, width, height).data;
    for (let index = 3; index < pixels.length; index += 160) {
      if ((pixels[index] ?? 0) > 0) return true;
    }
    return false;
  })).toBe(true);
  await page.getByRole("button", { name: "Увеличить" }).click();
  await expect(page.getByRole("button", { name: /%/ })).toContainText("98%");
  expect(errors).toEqual([]);
});

test("универсальная кисть рисует только при удержании и выравнивает фигуру", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Mouse/trackpad semantics проверяются в desktop-профиле");
  const errors = watchConsole(page);
  await page.goto("/project/wayyaam/canvas");
  await page.getByRole("button", { name: "Рисование" }).click();
  const brushPanel = page.getByRole("complementary", { name: "Параметры кисти" });
  await expect(brushPanel).toBeVisible();
  await page.getByLabel("Ширина кисти").fill("16");
  const brushPreview = page.getByRole("status", { name: "Размер кисти 16 пикселей" });
  await expect(brushPreview).toBeVisible();
  await expect(brushPreview).toHaveAttribute("data-brush-size", "16");
  const workspace = page.locator(".canvas-workspace");
  const panelBox = await brushPanel.boundingBox();
  const workspaceBox = await workspace.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(workspaceBox).not.toBeNull();
  if (panelBox && workspaceBox) {
    expect(panelBox.x).toBeLessThan(workspaceBox.x + workspaceBox.width / 2);
    expect(panelBox.y + panelBox.height).toBeGreaterThan(workspaceBox.y + workspaceBox.height / 2);
  }
  const canvas = workspace.locator("canvas").first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + 550, box.y + 160);
  await page.mouse.move(box.x + 850, box.y + 160, { steps: 10 });
  await expect(workspace).toHaveAttribute("data-stroke-count", "0");

  await page.mouse.move(box.x + 550, box.y + 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 850, box.y + 160, { steps: 24 });
  await expect(workspace).toHaveAttribute("data-stroke-count", "1");
  await page.waitForTimeout(700);
  await expect(workspace).toHaveAttribute("data-perfected-stroke-count", "1");
  await page.mouse.move(box.x + 880, box.y + 160, { steps: 4 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  await expect(workspace).toHaveAttribute("data-perfected-stroke-count", "1");
  await expect(page.locator(".sync-label")).toContainText("Фигура выровнена: line");
  await page.locator(".canvas-history-controls").getByRole("button", { name: "Отменить" }).click();
  await expect(workspace).toHaveAttribute("data-stroke-count", "0");
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(workspace).toHaveAttribute("data-stroke-count", "1");
  expect(errors).toEqual([]);
});

test("Canvas поддерживает лассо, группы, блокировку и выравнивание", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Точные mouse-координаты проверяются в desktop-профиле");
  const errors = watchConsole(page);
  await page.goto("/project/wayyaam/canvas");
  await page.getByRole("button", { name: "Лассо" }).click();
  const canvas = page.locator(".canvas-workspace canvas").first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + 110, box.y + 70);
  await page.mouse.down();
  await page.mouse.move(box.x + 510, box.y + 300, { steps: 12 });
  await page.mouse.up();

  const actions = page.getByRole("toolbar", { name: "Действия с выбранными объектами" });
  await expect(actions).toBeVisible();
  await expect(actions.locator(".selection-count")).toHaveText("2");
  await expect(page.getByRole("button", { name: "Выбор" })).toHaveClass(/active/);
  await actions.getByRole("button", { name: "Копировать выбранное" }).click();
  await expect(page.locator(".canvas-workspace")).toHaveAttribute("data-item-count", "11");
  await actions.getByRole("button", { name: "Удалить выбранное" }).click();
  await expect(page.locator(".canvas-workspace")).toHaveAttribute("data-item-count", "9");

  await page.getByRole("button", { name: "Лассо" }).click();
  await page.mouse.move(box.x + 110, box.y + 70);
  await page.mouse.down();
  await page.mouse.move(box.x + 510, box.y + 300, { steps: 12 });
  await page.mouse.up();
  await actions.getByRole("button", { name: "Сгруппировать" }).click();
  await expect(page.locator(".sync-label")).toContainText("Сгруппировано: 2");
  await actions.getByRole("button", { name: "Заблокировать" }).click();
  await expect(actions.getByRole("button", { name: "Разблокировать" })).toBeVisible();
  await actions.getByRole("button", { name: "Разблокировать" }).click();
  await actions.getByRole("button", { name: "Выровнять по вертикальной оси" }).click();
  await expect(page.locator(".sync-label")).toContainText("Выровнено");
  await actions.getByRole("button", { name: "Разгруппировать" }).click();
  await expect(page.locator(".sync-label")).toContainText("Группа разобрана");
  expect(errors).toEqual([]);
});

test("Canvas стирает часть линии ластиком выбранного размера", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Точные mouse-координаты проверяются в desktop-профиле");
  const errors = watchConsole(page);
  await page.goto("/project/wayyaam/canvas");
  const workspace = page.locator(".canvas-workspace");
  const canvas = workspace.locator("canvas").first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.getByRole("button", { name: "Рисование" }).click();
  await page.mouse.move(box.x + 550, box.y + 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 900, box.y + 160, { steps: 48 });
  await page.mouse.up();
  await expect(workspace).toHaveAttribute("data-stroke-count", "1");

  await page.getByRole("button", { name: "Ластик" }).click();
  const eraser = page.getByRole("complementary", { name: "Параметры ластика" });
  await expect(eraser).toBeVisible();
  await eraser.getByLabel("Размер ластика").fill("48");
  await page.mouse.move(box.x + 725, box.y + 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 737, box.y + 160, { steps: 3 });
  await page.mouse.up();
  await expect(workspace).toHaveAttribute("data-stroke-count", "2");
  await expect(page.locator(".sync-label")).toContainText("Линия стёрта");
  await page.reload();
  await expect(workspace).toHaveAttribute("data-stroke-count", "2");
  expect(errors).toEqual([]);
});

test("Canvas создаёт редактируемую интеллект-карту из шаблона", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Точные координаты темы проверяются в desktop-профиле");
  const errors = watchConsole(page);
  await page.goto("/project/wayyaam/canvas");
  const workspace = page.locator(".canvas-workspace");
  await page.getByRole("button", { name: "Шаблоны" }).click();
  const templates = page.getByRole("dialog", { name: "Выберите структуру" });
  await expect(templates.getByRole("img", { name: /Превью: Карта проекта/ })).toContainText("Цель");
  await expect(templates.getByRole("img", { name: /Превью: План по этапам/ })).toContainText("Сейчас");
  await expect(templates.getByRole("img", { name: /Превью: Разбор идеи/ })).toContainText("Проблема");
  await expect(templates.getByRole("img", { name: /Превью: Чистая карта/ })).toContainText("Тема");
  await templates.getByRole("button", { name: /Карта проекта/ }).click();
  await templates.getByRole("button", { name: "Применить шаблон" }).click();
  await expect(workspace).toHaveAttribute("data-item-count", "7");
  await expect(workspace).toHaveAttribute("data-connection-count", "6");

  const canvas = workspace.locator("canvas").first();
  await canvas.click({ position: { x: 450, y: 280 } });
  const quickEditor = page.getByRole("toolbar", { name: "Быстрое редактирование темы" });
  await expect(quickEditor).toBeVisible();
  await quickEditor.getByLabel("Быстрый текст темы").fill("Запуск продукта");
  await quickEditor.getByLabel("Быстрый текст темы").press("Enter");
  await quickEditor.getByLabel("Быстрый цвет карточки").fill("#2457a6");
  await expect(page.locator(".sync-label")).toContainText("Цвет карточки обновлён");
  const actions = page.getByRole("toolbar", { name: "Действия с выбранными объектами" });
  await actions.getByRole("button", { name: "Редактировать тему" }).click();
  let editor = page.getByRole("dialog", { name: "Текст и оформление" });
  await expect(editor.getByLabel("Текст темы")).toHaveValue("Запуск продукта");
  await editor.getByLabel("Подробная заметка").fill("Проверить гипотезы и выпустить первую версию");
  await editor.getByLabel("Размер текста").fill("24");
  await editor.getByRole("button", { name: "Сохранить тему" }).click();
  await expect(workspace).toHaveAttribute("data-note-count", "2");

  await actions.getByRole("button", { name: "Добавить подтему" }).click();
  editor = page.getByRole("dialog", { name: "Текст и оформление" });
  await editor.getByLabel("Текст темы").fill("Исследование");
  await editor.getByRole("button", { name: "Сохранить тему" }).click();
  await expect(workspace).toHaveAttribute("data-item-count", "8");
  await expect(workspace).toHaveAttribute("data-connection-count", "7");

  await page.reload();
  await expect(workspace).toHaveAttribute("data-item-count", "8");
  await expect(workspace).toHaveAttribute("data-connection-count", "7");
  expect(errors).toEqual([]);
});

test("Canvas создаёт горизонтальную карту и соседнюю тему одной кнопкой", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Структуру карты достаточно проверить один раз");
  const errors = watchConsole(page);
  await page.goto("/project/wayyaam/canvas");
  const workspace = page.locator(".canvas-workspace");
  await page.getByRole("button", { name: "Шаблоны" }).click();
  const templates = page.getByRole("dialog", { name: "Выберите структуру" });
  await templates.getByRole("button", { name: /Слева направо/ }).click();
  await templates.getByRole("button", { name: /Карта проекта/ }).click();
  await templates.getByRole("button", { name: "Применить шаблон" }).click();
  await expect(workspace).toHaveAttribute("data-item-count", "7");
  await expect(workspace).toHaveAttribute("data-connection-count", "6");

  const actions = page.getByRole("toolbar", { name: "Действия с выбранными объектами" });
  await expect(actions.getByRole("button", { name: "Добавить подтему" })).toBeEnabled();
  await actions.getByRole("button", { name: "Добавить соседнюю тему" }).click();
  const editor = page.getByRole("dialog", { name: "Текст и оформление" });
  await editor.getByLabel("Текст темы").fill("Соседняя идея");
  await editor.getByRole("button", { name: "Сохранить тему" }).click();
  await expect(workspace).toHaveAttribute("data-item-count", "8");
  await expect(workspace).toHaveAttribute("data-connection-count", "6");
  expect(errors).toEqual([]);
});

test("Canvas применяет шесть палитр, сохраняет дизайн и поддерживает жесты Undo/Redo", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Палитры и pointer-жесты достаточно проверить один раз");
  const errors = watchConsole(page);
  await page.goto("/project/wayyaam/canvas");
  const workspace = page.locator(".canvas-workspace");
  await page.getByRole("button", { name: "Дизайн" }).click();
  const designPanel = page.getByRole("complementary", { name: "Дизайн интеллект-карты" });
  await expect(designPanel).toBeVisible();
  await expect(designPanel.locator(".canvas-palette-grid > button")).toHaveCount(6);
  await designPanel.getByText("Своя палитра", { exact: true }).click();
  await expect(designPanel.locator('.custom-palette-colors input[type="color"]')).toHaveCount(6);
  await designPanel.getByRole("button", { name: /Океан/ }).click();
  await expect(workspace).toHaveAttribute("data-palette-id", "ocean");
  await expect(workspace).toHaveAttribute("data-history-index", "1");
  await page.getByRole("button", { name: "Закрыть дизайн" }).click();

  const dispatchTouchTap = async (pointerCount: number) => workspace.locator(".konvajs-content").evaluate((element, count) => {
    const rect = element.getBoundingClientRect();
    const eventInit = (pointerId: number, buttons: number) => ({
      pointerId,
      pointerType: "touch",
      isPrimary: pointerId === 1,
      bubbles: true,
      cancelable: true,
      buttons,
      clientX: rect.left + 650 + pointerId * 4,
      clientY: rect.top + 420,
    });
    for (let pointerId = 1; pointerId <= count; pointerId += 1) {
      element.dispatchEvent(new PointerEvent("pointerdown", eventInit(pointerId, 1)));
    }
    for (let pointerId = 1; pointerId <= count; pointerId += 1) {
      element.dispatchEvent(new PointerEvent("pointerup", eventInit(pointerId, 0)));
    }
  }, pointerCount);

  await dispatchTouchTap(2);
  await expect(workspace).toHaveAttribute("data-history-index", "0");
  await expect(page.locator(".sync-label")).toContainText("Действие отменено");
  await dispatchTouchTap(3);
  await expect(workspace).toHaveAttribute("data-history-index", "1");
  await expect(page.locator(".sync-label")).toContainText("Действие повторено");

  await page.reload();
  await expect(workspace).toHaveAttribute("data-palette-id", "ocean");
  expect(errors).toEqual([]);
});

test("Canvas добавляет карточки и изображения с offline-восстановлением", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Файловый сценарий достаточно проверить один раз");
  const errors = watchConsole(page);
  await page.goto("/project/wayyaam/canvas");
  const workspace = page.locator(".canvas-workspace");
  await expect(workspace).toHaveAttribute("data-item-count", "9");

  await page.getByRole("button", { name: "Ещё объекты" }).click();
  await page.getByRole("menuitem", { name: /Задача/ }).click();
  const linkDialog = page.getByRole("dialog", { name: "Выберите задачу" });
  await expect(linkDialog).toBeVisible();
  await linkDialog.getByRole("button", { name: /Дизайн главного экрана/ }).click();
  await expect(workspace).toHaveAttribute("data-item-count", "10");
  await expect(workspace).toHaveAttribute("data-linked-item-count", "1");

  await page.getByRole("button", { name: "Ещё объекты" }).click();
  await page.getByRole("menuitem", { name: /Файл/ }).click();
  const fileDialog = page.getByRole("dialog", { name: "Выберите файл" });
  await fileDialog.getByRole("button", { name: /Презентация.pdf/ }).click();
  await expect(workspace).toHaveAttribute("data-item-count", "11");
  await expect(workspace).toHaveAttribute("data-linked-item-count", "2");

  await page.locator('input[type="file"][accept="image/*"]').setInputFiles("public/tree-icon.svg");
  await expect(workspace).toHaveAttribute("data-item-count", "12");
  await expect(page.locator(".sync-label")).toContainText("Сохранено на устройстве");
  await page.reload();
  await expect(workspace).toHaveAttribute("data-item-count", "12");
  await expect(workspace).toHaveAttribute("data-linked-item-count", "2");
  expect(errors).toEqual([]);
});

test("Canvas экспортирует настоящий PDF", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Экспорт достаточно проверить один раз");
  const errors = watchConsole(page);
  await page.goto("/project/wayyaam/canvas");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспортировать PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("treetask-wayyaam-canvas.pdf");
  expect(await download.failure()).toBeNull();
  await expect(page.locator(".sync-label")).toContainText("PDF экспортирован");
  expect(errors).toEqual([]);
});

test("фото и векторная аннотация сохраняются раздельно", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/project/wayyaam/annotate");
  await expect(page.getByRole("heading", { name: "Аннотация изображения" })).toBeVisible();
  await expect(page.locator(".source-integrity code")).not.toContainText("Считаем");
  const hashBefore = await page.locator(".source-integrity code").textContent();
  const canvas = page.locator(".annotation-stage-shell canvas").first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  if (test.info().project.name === "phone") {
    await page.getByRole("button", { name: "Текст" }).tap();
    await canvas.tap({ position: { x: box.width * 0.45, y: box.height * 0.4 } });
  } else {
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.35, { steps: 8 });
    await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.48, { steps: 8 });
    await page.mouse.up();
  }
  await expect(page.getByText("1 пометок")).toBeVisible();
  if (test.info().project.name === "desktop") {
    const pdfDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    const download = await pdfDownload;
    expect(download.suggestedFilename()).toBe("annotation-reference-annotated.pdf");
    expect(await download.failure()).toBeNull();
    await expect(page.getByText(/PDF с пометками экспортирован/)).toBeVisible();
  }
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText(/Сохранено отдельно/)).toBeVisible();
  expect(await page.locator(".source-integrity code").textContent()).toBe(hashBefore);
  await page.reload();
  await expect(page.getByText("Аннотация восстановлена из IndexedDB")).toBeVisible();
  await expect(page.getByText("1 пометок")).toBeVisible();
  expect(errors).toEqual([]);
});

test("результат проходит путь доказательство → подтверждение → плоды", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Доменный сценарий достаточно проверить один раз");
  const errors = watchConsole(page);
  const title = "E2E подтверждённый результат";
  await page.goto("/project/wayyaam/outcomes");
  await page.getByRole("button", { name: "Новый результат" }).click();
  const form = page.getByRole("region", { name: "Новый результат" });
  await form.getByLabel("Название").fill(title);
  await form.getByLabel("Критерий подтверждения").fill("Публичная проверяемая ссылка");
  await form.getByRole("button", { name: "Создать" }).click();
  const outcome = page.locator(".outcomes-list article").filter({ hasText: title });
  await expect(outcome).toBeVisible();
  await outcome.getByRole("button", { name: "Ссылка" }).click();
  const evidence = page.getByRole("dialog", { name: "Добавить ссылку" });
  await evidence.getByLabel("URL").fill("https://example.com/release");
  await evidence.getByLabel("Комментарий").fill("Проверено в E2E");
  await evidence.getByRole("button", { name: "Отправить результат" }).click();
  await expect(outcome.getByText("Отправлен")).toBeVisible();
  await outcome.getByRole("button", { name: "Подтвердить" }).click();
  await expect(outcome.locator(".status-pill")).toHaveText("Подтверждён");
  await expect(page.getByText(/полноценные плоды/)).toBeVisible();
  await page.reload();
  await expect(page.locator(".outcomes-list article").filter({ hasText: title }).locator(".status-pill")).toHaveText("Подтверждён");
  expect(errors).toEqual([]);
});

test("PWA открывает сохранённую оболочку без сети", async ({ page, context }) => {
  test.skip(test.info().project.name !== "desktop", "Offline shell достаточно проверить один раз");
  await page.goto("/");
  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByText("Офлайн · данные сохраняются")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".dashboard-heading h1")).toHaveText(/^(Доброе утро|Добрый день|Добрый вечер|Доброй ночи)$/);
});

test("изменения без сети попадают в очередь автоматической синхронизации", async ({ page, context }) => {
  test.skip(test.info().project.name !== "desktop", "Offline-очередь достаточно проверить один раз");
  await page.goto("/projects");
  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) await navigator.serviceWorker.ready;
  });
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload();
  }
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));

  await page.getByRole("main").getByRole("button", { name: "Новый проект", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Новый проект" });
  await dialog.getByLabel("Название").fill("Проект без сети");
  await dialog.getByRole("button", { name: "Создать проект" }).click();

  await expect(page.getByText("Офлайн · сохранено: 1")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: /Проект без сети/ }).click();
  await page.getByRole("main").getByRole("link", { name: "Холст", exact: true }).click();
  const workspace = page.locator(".canvas-workspace");
  await expect(workspace).toHaveAttribute("data-item-count", "9");
  await page.getByRole("button", { name: "Стикер" }).click();
  await workspace.click({ position: { x: 230, y: 310 } });
  await expect(workspace).toHaveAttribute("data-item-count", "10");
  await expect(page.getByText("Офлайн · сохранено: 2")).toBeVisible();

  const queued = await page.evaluate(async () => new Promise<{ count: number; canvas: boolean }>((resolve, reject) => {
    const request = indexedDB.open("treetask");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const transaction = request.result.transaction("mutationQueue", "readonly");
      const items = transaction.objectStore("mutationQueue").getAll();
      items.onerror = () => reject(items.error);
      items.onsuccess = () => resolve({
        count: items.result.length,
        canvas: items.result.some((item) => item.entity === "canvas" && item.payload?.kind === "canvas_snapshot"),
      });
    };
  }));
  expect(queued.count).toBeGreaterThanOrEqual(2);
  expect(queued.canvas).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(workspace).toHaveAttribute("data-item-count", "10");
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
});
