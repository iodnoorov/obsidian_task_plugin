export const DONE = '[D]';
export function isDone(name: string): boolean { return name.startsWith(DONE); }
export function taskTitle(name: string): string { return isDone(name) ? name.slice(DONE.length) : name; }
export function toggledName(name: string): string { return isDone(name) ? taskTitle(name) : DONE + name; }
export function validateTitle(value: string): string {
 const title = value.trim();
 if (!title || title === '.' || title === '..') throw new Error('Введите название задачи.');
 if (/[\\/:*?"<>|\r\n\u0000-\u001f]/.test(title) || /[. ]$/.test(title)) throw new Error('Название содержит недопустимые символы или заканчивается точкой.');
 if (isDone(title)) throw new Error('Префикс [D] зарезервирован для выполненных задач.');
 return title;
}
export function filePath(folder: string, name: string): string { return `${folder ? folder + '/' : ''}${name}.md`; }

/** Local calendar dates; never convert through UTC. */
export function localDay(date = new Date()): string {
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function validDay(value: unknown): value is string {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const date = new Date(`${value}T12:00:00`);
 return !Number.isNaN(date.getTime()) && localDay(date) === value;
}
export function shiftDay(day: string, amount: number): string {
 const date = new Date(`${day}T12:00:00`); date.setDate(date.getDate()+amount); return localDay(date);
}
export function taskDates(frontmatter: Record<string, unknown> | undefined, created: number, modified: number, done: boolean) {
 const start = validDay(frontmatter?.task_date) ? frontmatter.task_date : localDay(new Date(created));
 const closed = done ? (validDay(frontmatter?.task_closed) ? frontmatter.task_closed : localDay(new Date(modified))) : undefined;
 return { start, closed };
}
export function visibleOn(day: string, start: string, closed?: string): boolean {
 return day >= start && (!closed || day <= closed);
}
