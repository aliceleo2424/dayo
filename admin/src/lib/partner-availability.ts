export type AvailabilitySlot = { id: string; slot_time: string; status: 'available' | 'booked' };
export type PartnerAvailability = {
  partner_id: string; start: string; end: string; as_of: string;
  min_lead_hours: number; capability_configured: boolean; slots: AvailabilitySlot[];
};
export type AvailabilityDay = { date: string; available: number[]; booked: number[] };
const HALF_HOUR = 30 * 60 * 1000;

export function slotMs(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return NaN;
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}+09:00`);
}
export function kstDate(ms: number) { return new Date(ms + 9 * 3600000).toISOString().slice(0,10); }
export function timeLabel(ms: number) { return new Date(ms + 9 * 3600000).toISOString().slice(11,16); }
export function addDays(date: string, count: number) { return new Date(Date.parse(`${date}T00:00:00Z`) + count * 86400000).toISOString().slice(0,10); }
export function shiftMonth(month: string, count: number) {
  return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-1+count,1)).toISOString().slice(0,7);
}
export function groupAvailability(data: PartnerAvailability, range: number, now = Date.now()): AvailabilityDay[] {
  const start = kstDate(now);
  const end = addDays(start, range - 1);
  const days = new Map<string, AvailabilityDay>();
  for (const slot of data.slots) {
    const ms = slotMs(slot.slot_time);
    if (!Number.isFinite(ms) || ms <= now || !['available','booked'].includes(slot.status)) continue;
    const date = kstDate(ms);
    if (date < start || date > end || date > data.end) continue;
    if (slot.status === 'available' && (!data.capability_configured || ms < now + data.min_lead_hours * 3600000)) continue;
    if (!days.has(date)) days.set(date, { date, available: [], booked: [] });
    days.get(date)![slot.status].push(ms);
  }
  return [...days.values()].sort((a,b) => a.date.localeCompare(b.date)).map(day => {
    const booked = [...new Set(day.booked)].sort((a,b) => a-b);
    return { ...day, booked, available: [...new Set(day.available)].filter(ms => !booked.includes(ms)).sort((a,b) => a-b) };
  });
}
export function mergedTimes(times: number[]) {
  const sorted = [...new Set(times)].sort((a,b) => a-b);
  const ranges: string[] = [];
  for (let i=0; i<sorted.length; i++) {
    const start=sorted[i]; let end=start;
    while (i+1<sorted.length && sorted[i+1]-end===HALF_HOUR) end=sorted[++i];
    ranges.push(start===end ? timeLabel(start) : `${timeLabel(start)}–${timeLabel(end+HALF_HOUR)}`);
  }
  return ranges.join(', ');
}
export function copySchedule(name: string, days: AvailabilityDay[]) {
  const clean = name.trim().replace(/[\r\n]+/g,' ');
  const display = clean && !clean.includes('@') ? clean : 'DayO Partner';
  return [`${display} available (KST)`, ...days.filter(day=>day.available.length).map(day =>
    `${Number(day.date.slice(5,7))}/${Number(day.date.slice(8,10))}: ${mergedTimes(day.available)}`)].join('\n');
}
export function calendarCells(month: string): (string | null)[] {
  const start=month+'-01';
  const offset=new Date(`${start}T00:00:00Z`).getUTCDay();
  const count=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
  const cells: (string|null)[] = Array(offset).fill(null);
  for(let i=0;i<count;i++) cells.push(addDays(start,i));
  while(cells.length%7) cells.push(null);
  return cells;
}
