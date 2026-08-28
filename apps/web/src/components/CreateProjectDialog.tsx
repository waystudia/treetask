import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { saveProjectOffline } from "../data/db";

const schema = z.object({
  title: z.string().trim().min(2, "Введите название проекта").max(160),
  description: z.string().trim().max(500),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Выберите цвет"),
});

type FormValues = z.infer<typeof schema>;

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateProjectDialog({ open, onClose }: CreateProjectDialogProps) {
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
      color: "#5b5cf0",
    },
  });

  const close = () => {
    reset();
    onClose();
  };
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;
  const submit = handleSubmit(async (values) => {
    await saveProjectOffline({
      id: crypto.randomUUID(),
      title: values.title,
      description: values.description,
      color: values.color,
      taskProgress: 0,
      outcomeProgress: null,
      members: ["В"],
      tasksToday: 0,
      overdue: 0,
    });
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
          <div><span className="eyebrow">Новый рост</span><h2 id="create-project-title">Новый проект</h2></div>
          <button className="icon-button" type="button" onClick={close} aria-label="Закрыть"><X size={20} /></button>
        </header>
        <form onSubmit={submit}>
          <label>
            Название
            <input autoFocus placeholder="Например, приложение клиента" {...register("title")} />
            {errors.title ? <span className="field-error">{errors.title.message}</span> : null}
          </label>
          <label>
            Описание
            <input placeholder="Коротко о результате проекта" {...register("description")} />
            {errors.description ? <span className="field-error">{errors.description.message}</span> : null}
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
