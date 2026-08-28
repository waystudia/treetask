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
  await expect(page.getByRole("heading", { name: /Добрый вечер/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Зелёное дерево/ })).toHaveAccessibleName(
    /стадия 10 из 20, рост по задачам 49%, общий прогресс 49%/,
  );
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test("задача сохраняется в IndexedDB и переживает reload", async ({ page }) => {
  const errors = watchConsole(page);
  const title = `Offline задача ${test.info().project.name}`;
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Новая задача" }).click();
  const dialog = page.getByRole("dialog", { name: "Новая задача" });
  await dialog.getByLabel("Название").fill(title);
  await dialog.getByLabel("Вес").selectOption("5");
  await dialog.getByLabel("Срок").fill("18:30");
  await dialog.getByRole("button", { name: "Создать задачу" }).click();
  await expect(page.getByText(title)).toBeVisible();
  await page.reload();
  await expect(page.getByText(title)).toBeVisible();
  expect(errors).toEqual([]);
});

test("проект создаётся offline и доступен при создании задачи", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "CRUD-сценарий достаточно проверить один раз");
  const errors = watchConsole(page);
  const projectTitle = "Новый продукт";
  const taskTitle = "Проверить гипотезу";
  await page.goto("/projects");
  await page.getByRole("button", { name: "Новый проект" }).click();
  const projectDialog = page.getByRole("dialog", { name: "Новый проект" });
  await projectDialog.getByLabel("Название").fill(projectTitle);
  await projectDialog.getByLabel("Описание").fill("Проверка полного CRUD-контура");
  await projectDialog.getByRole("button", { name: "Создать проект" }).click();
  await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();

  await page.goto("/tasks");
  await page.getByRole("button", { name: "Новая задача" }).click();
  const taskDialog = page.getByRole("dialog", { name: "Новая задача" });
  await taskDialog.getByLabel("Название").fill(taskTitle);
  await taskDialog.getByLabel("Проект").selectOption({ label: projectTitle });
  await taskDialog.getByRole("button", { name: "Создать задачу" }).click();
  await expect(page.getByText(taskTitle)).toBeVisible();
  await expect(page.getByText(projectTitle)).toBeVisible();
  await page.reload();
  await expect(page.getByText(taskTitle)).toBeVisible();
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
  await expect(page.getByRole("complementary", { name: "Параметры кисти" })).toBeVisible();
  await page.getByLabel("Ширина кисти").fill("16");
  const workspace = page.locator(".canvas-workspace");
  const canvas = workspace.locator("canvas").first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + 380, box.y + 90);
  await page.mouse.move(box.x + 650, box.y + 90, { steps: 10 });
  await expect(workspace).toHaveAttribute("data-stroke-count", "0");

  await page.mouse.move(box.x + 380, box.y + 90);
  await page.mouse.down();
  await page.mouse.move(box.x + 650, box.y + 90, { steps: 24 });
  await expect(workspace).toHaveAttribute("data-stroke-count", "1");
  await page.waitForTimeout(1_250);
  await page.mouse.up();
  await expect(page.locator(".sync-label")).toContainText("Исправлено: line");
  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(page.locator(".sync-label")).toContainText("Исходный штрих восстановлен");
  await page.getByRole("button", { name: "Отменить" }).click();
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
  await expect(page.getByText("Нет сети — изменения сохраняются на устройстве")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Добрый вечер/ })).toBeVisible();
});
