import { isDone, taskTitle } from './tasks';
export interface OrderedTask { path: string; basename: string }
export function sortTasks<T extends OrderedTask>(tasks: T[], order: string[]): T[] {
 const rank = new Map(order.map((path, i) => [path, i]));
 return [...tasks].sort((a,b) => Number(isDone(a.basename))-Number(isDone(b.basename)) ||
  (rank.get(a.path) ?? Infinity)-(rank.get(b.path) ?? Infinity) || taskTitle(a.basename).localeCompare(taskTitle(b.basename), 'ru'));
}
export function reorderTasks<T extends OrderedTask>(tasks: T[], order: string[], moved: T, target?: T, after = false): string[] {
 const sorted = sortTasks(tasks, order).filter(task => task.path !== moved.path);
 const group = sorted.filter(task => isDone(task.basename) === isDone(moved.basename));
 let index = target ? group.findIndex(task => task.path === target.path) : -1;
 if (index < 0) index = group.length; else if (after) index++;
 group.splice(index, 0, moved);
 const other = sorted.filter(task => isDone(task.basename) !== isDone(moved.basename));
 return (isDone(moved.basename) ? [...other,...group] : [...group,...other]).map(task => task.path);
}
