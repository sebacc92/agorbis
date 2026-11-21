const formatUtc = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

/** Las fechas objetivo son días civiles: no se inventa una hora ni se aplica un huso. */
export function calendarDates(endDate: string, allDay = false) {
  const end = new Date(endDate);
  if (!Number.isFinite(end.getTime())) return null;
  if (allDay) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
      end.toISOString().slice(0, 10) !== endDate
    )
      return null;
    return {
      start: endDate.replace(/-/g, ""),
      end: new Date(end.getTime() + 86400000)
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, ""),
    };
  }
  return {
    start: formatUtc(new Date(end.getTime() - 3600000)),
    end: formatUtc(end),
  };
}

/** Evita convertir puntuación o saltos de texto ciudadano en propiedades de ICS. */
export function escapeCalendarText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}
