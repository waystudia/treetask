import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  CheckSquare2,
  LockKeyhole,
  PanelsTopLeft,
  Users,
  X,
} from "lucide-react";
import { useLayoutEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "../auth/AuthProvider";
import { db, saveProjectMemberOffline, saveProjectOffline } from "../data/db";
import { DEMO_CURRENT_PROFILE_ID } from "../data/demo";

const schema = z.object({
  title: z.string().trim().min(2, "Введите название проекта").max(160),
  description: z.string().trim().max(500),
  goal: z.string().trim().max(500),
  areaId: z.string().max(100),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Выберите цвет"),
  spaceType: z.enum(["personal", "team"]),
  useTasks: z.boolean(),
  useCanvas: z.boolean(),
  useCalendar: z.boolean(),
}).refine((values) => values.useTasks || values.useCanvas || values.useCalendar, {
  message: "Выберите хотя бы один инструмент",
  path: ["useTasks"],
});

type FormValues = z.infer<typeof schema>;

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  defaultAreaId?: string;
}

export function CreateProjectDialog({ open, onClose, defaultAreaId }: CreateProjectDialogProps) {
  const { user } = useAuth();
  const areas = useLiveQuery(() => db.areas.orderBy("position").toArray(), [], []);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      goal: "",
      areaId: "",
      color: "#5b5cf0",
      spaceType: "team",
      useTasks: true,
      useCanvas: true,
      useCalendar: true,
    },
  });

  const close = () => {
    reset();
    onClose();
  };
  useLayoutEffect(() => {
    if (!open) return;
    reset({
      title: "",
      description: "",
      goal: "",
      areaId: defaultAreaId ?? "",
      color: "#5b5cf0",
      spaceType: "team",
      useTasks: true,
      useCanvas: true,
      useCalendar: true,
    });
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [defaultAreaId, open, reset]);

  if (!open) return null;
  const submit = handleSubmit(async (values) => {
    const projectId = crypto.randomUUID();
    const ownerId = user?.id ?? DEMO_CURRENT_PROFILE_ID;
    const accountName = user?.user_metadata?.display_name
      ?? user?.email?.split("@")[0]
      ?? "Вы";
    const accountInitial = accountName.at(0)?.toLocaleUpperCase("ru") ?? "В";
    const enabledViews = [
      values.useTasks ? "tasks" : null,
      values.useCanvas ? "canvas" : null,
      values.useCalendar ? "calendar" : null,
    ].filter((value): value is "tasks" | "canvas" | "calendar" => value !== null);
    await saveProjectOffline({
      id: projectId,
      areaId: values.areaId || undefined,
      title: values.title,
      description: values.description,
      goal: values.goal,
      currentStage: "Планирование",
      plan: "",
      wipLimit: 3,
      color: values.color,
      taskProgress: 0,
      outcomeProgress: null,
      members: [accountInitial],
      memberDetails: [{
        userId: user?.id ?? "local:me",
        name: accountName,
        initial: accountInitial,
        role: "owner",
      }],
      spaceType: values.spaceType,
      enabledViews,
      tasksToday: 0,
      overdue: 0,
    });
    await saveProjectMemberOffline({
      id: `${projectId}:${ownerId}`,
      projectId,
      userId: ownerId,
      role: "owner",
      responsibility: "Цели и приоритеты",
      allocationPercent: 100,
      invitedBy: ownerId,
      joinedAt: new Date().toISOString(),
    }, "insert");
    close();
  });

  return (
    <div className="dialog-backdrop" role="presentation" onPointerDown={close}>
      <section
        className="quick-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header>
          <div><span className="eyebrow">Новое рабочее пространство</span><h2 id="create-project-title">Новый проект</h2></div>
          <button className="icon-button" type="button" onClick={close} aria-label="Закрыть"><X size={20} /></button>
        </header>
        <form onSubmit={submit}>
          <fieldset className="project-choice-fieldset">
            <legend>Где будет проект?</legend>
            <div className="project-kind-grid">
              <label className="project-choice-card">
                <input type="radio" value="personal" {...register("spaceType")} />
                <span className="project-choice-icon"><LockKeyhole size={19} /></span>
                <span><strong>Личный</strong><small>Только ваши дела и заметки</small></span>
              </label>
              <label className="project-choice-card">
                <input type="radio" value="team" {...register("spaceType")} />
                <span className="project-choice-icon"><Users size={19} /></span>
                <span><strong>Командный</strong><small>Участники, роли и общие задачи</small></span>
              </label>
            </div>
          </fieldset>
          <fieldset className="project-choice-fieldset">
            <legend>Что понадобится?</legend>
            <p>Лишние разделы не появятся в проекте. Их можно включить позже.</p>
            <div className="project-module-grid">
              <label className="project-module-card"><input type="checkbox" {...register("useTasks")} /><CheckSquare2 size={18} /><span><strong>Задачи</strong><small>Список и доска</small></span></label>
              <label className="project-module-card"><input type="checkbox" {...register("useCanvas")} /><PanelsTopLeft size={18} /><span><strong>Холст</strong><small>Схемы и mind map</small></span></label>
              <label className="project-module-card"><input type="checkbox" {...register("useCalendar")} /><CalendarDays size={18} /><span><strong>Календарь</strong><small>Сроки и планы</small></span></label>
            </div>
            {errors.useTasks ? <span className="field-error">{errors.useTasks.message}</span> : null}
          </fieldset>
          <label>
            Название
            <input autoFocus placeholder="Например, приложение клиента" {...register("title")} />
            {errors.title ? <span className="field-error">{errors.title.message}</span> : null}
          </label>
          <label>
            Область
            <select {...register("areaId")}>
              <option value="">Без области</option>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.title}</option>)}
            </select>
          </label>
          <label>
            Описание
            <input placeholder="Коротко о результате проекта" {...register("description")} />
            {errors.description ? <span className="field-error">{errors.description.message}</span> : null}
          </label>
          <label>
            Цель
            <input placeholder="Какой результат должен дать проект" {...register("goal")} />
            {errors.goal ? <span className="field-error">{errors.goal.message}</span> : null}
          </label>
          <label className="project-color-field">
            Цвет проекта
            <input type="color" {...register("color")} />
            {errors.color ? <span className="field-error">{errors.color.message}</span> : null}
          </label>
          <footer>
            <button className="button secondary" type="button" onClick={close}>Отмена</button>
            <button className="button primary" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Сохраняем…" : "Создать проект"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
