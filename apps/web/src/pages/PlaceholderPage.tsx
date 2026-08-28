import { useParams } from "@tanstack/react-router";
import { Bell, Star, Users } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

const sections = {
  team: ["Команда", "Управление ролями и загрузкой участников.", Users],
  favorites: ["Избранное", "Быстрый доступ к важным задачам, файлам и Canvas.", Star],
  notifications: ["Уведомления", "Сроки, упоминания, подтверждения и изменения.", Bell],
  activity: ["Активность", "Единая история действий по проектам.", Bell],
} as const;

export function PlaceholderPage() {
  const { sectionId } = useParams({ from: "/section/$sectionId" });
  const [title, description, Icon] = sections[sectionId as keyof typeof sections] ?? ["Раздел", "Раздел находится в рабочем плане.", Star];
  return <div className="page"><PageHeader title={title} description={description} /><div className="empty-state large"><Icon size={32} /><h2>{title}</h2><p>Базовый маршрут готов. Данные будут подключены следующим вертикальным срезом.</p></div></div>;
}
