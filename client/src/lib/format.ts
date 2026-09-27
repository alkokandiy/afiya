export function formatTime(iso: string, t: (s: string) => string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return `${t("Bugun")} ${time}`;
  if (days === 1) return `${t("Kecha")} ${time}`;
  return `${date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })} ${time}`;
}
