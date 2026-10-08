// Where someone is, from their time zone: "America/Toronto" → "Toronto" (editable later).

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function cityFromTimezone(tz: string): string {
  const last = tz.split("/").pop() ?? tz;
  return last.replace(/_/g, " ");
}

export function localTime(tz: string | null | undefined, at = new Date()): string {
  try {
    return at.toLocaleTimeString("en-US", { timeZone: tz ?? undefined, hour: "numeric", minute: "2-digit" });
  } catch {
    return at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
}

/** "Toronto · 9:41 AM" */
export function placeLine(city: string | null | undefined, tz: string | null | undefined): string {
  return [city, localTime(tz)].filter(Boolean).join(" · ");
}
