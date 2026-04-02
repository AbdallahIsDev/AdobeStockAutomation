export function jsonTimestamp(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hours24 = date.getHours();
  const hh = String(((hours24 + 11) % 12) + 1).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  return `${yyyy}-${mm}-${dd}  ${hh}:${mi}:${ss} ${meridiem}`;
}

export function dateFolderName(date: Date = new Date()): string {
  return jsonTimestamp(date).slice(0, 10);
}

export function compactDateStamp(date: Date = new Date()): string {
  return dateFolderName(date).replaceAll("-", "");
}
