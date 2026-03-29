export function jsonTimestamp(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}__${hh}:${mi}:${ss}`;
}

export function dateFolderName(date: Date = new Date()): string {
  return jsonTimestamp(date).slice(0, 10);
}

export function compactDateStamp(date: Date = new Date()): string {
  return dateFolderName(date).replaceAll("-", "");
}
