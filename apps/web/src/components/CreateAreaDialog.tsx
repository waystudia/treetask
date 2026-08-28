import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { db, saveAreaOffline } from "../data/db";

const schema = z.object({
  title: z.string().trim().min(2, "Введите название области").max(120),
  description: z.string().trim().max(300),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Выберите цвет"),
});

type FormValues = z.infer<typeof schema>;

interface CreateAreaDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateAreaDialog({ open, onClose }: CreateAreaDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", description: "", color: "#007aff" },
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
    await saveAreaOffline({
      id: crypto.randomUUID(),
      title: values.title,
      description: values.description,
      color: values.color,
      position: await db.areas.count(),
    });
    close();
  });

  return (
    <div className="dialog-backdrop" role="presentation" onPointerDown={close}>
      <section className="quick-dialog" role="dialog" aria-modal="true" aria-labelledby="create-area-title" onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <div><span className="eyebrow">Новая область</span><h2 id="create-area-title">Соберите связанные проекты</h2></div>
          <button className="icon-button" type="button" onClick={close} aria-label="Закрыть"><X size={20} /></button>
        </header>
        <form onSubmit={submit}>
          <label>
            Название
            <input autoFocus placeholder="Например, Работа" {...register("title")} />
            {errors.title ? <span className="field-error">{errors.title.message}</span> : null}
          </label>
          <label>
            Описание
            <input placeholder="Какую постоянную сферу объединяет область" {...register("description")} />
            {errors.description ? <span className="field-error">{errors.description.message}</span> : null}
          </label>
          <label className="project-color-field">
            Цвет области
            <input type="color" {...register("color")} />
          </label>
          <p className="form-note">Как в Things: область объединяет проекты одной постоянной сферы, а каждый проект содержит свои задачи.</p>
          <footer>
            <button className="button secondary" type="button" onClick={close}>Отмена</button>
            <button className="button primary" disabled={isSubmitting} type="submit">{isSubmitting ? "Сохраняем…" : "Создать область"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
