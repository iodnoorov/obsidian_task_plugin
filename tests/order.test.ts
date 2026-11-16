import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortTasks, reorderTasks } from '../src/order';
const task = (name: string) => ({path:`Проект/${name}.md`,basename:name});
const a=task('A'), b=task('B'), c=task('C'), done=task('[D]Готово');
test('completed tasks always follow active tasks regardless of saved ranks', () => {
 assert.deepEqual(sortTasks([b,done,a], [done.path,b.path,a.path]), [b,a,done]);
});
test('manual insertion before and after target survives persisted order', () => {
 const tasks=[a,b,c,done];
 const before=reorderTasks(tasks, [], c, a);
 assert.deepEqual(sortTasks(tasks, JSON.parse(JSON.stringify(before))), [c,a,b,done]);
 const after=reorderTasks(tasks, before, c, a, true);
 assert.deepEqual(sortTasks(tasks, after), [a,c,b,done]);
});
test('invisible tasks remain in order when inserting around visible ones', () => {
 assert.deepEqual(reorderTasks([a,b,c], [a.path,b.path,c.path], c, a), [c.path,a.path,b.path]);
});
test('completion and column background drops append to their own group', () => {
 const newlyDone=task('[D]B');
 assert.deepEqual(reorderTasks([a,done,newlyDone], [], newlyDone), [a.path,done.path,newlyDone.path]);
 assert.deepEqual(reorderTasks([a,b,done], [], a), [b.path,a.path,done.path]);
});
test('a task transferred from another column is inserted once at the target', () => {
 const moved=task('Перенесённая');
 assert.deepEqual(reorderTasks([a,b,moved,done], [], moved, b), [a.path,moved.path,b.path,done.path]);
});
