import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveTaskFile } from '../src/move';

test('moves the actual file preserving completed name and contents', async () => {
 const source = 'Работа/Задачи/[D]Отчёт.md';
 const contents = "---\ntask_date: '2026-11-16'\ntask_closed: '2026-11-17'\n---\nТекст";
 const files = new Map([[source, contents]]);
 const moved = await moveTaskFile({path:source,name:'[D]Отчёт.md'}, 'Личное/Задачи', path => files.has(path), async path => { files.set(path, files.get(source)!); files.delete(source); });
 assert.equal(moved, true);
 assert.equal(files.has(source), false);
 assert.equal(files.get('Личное/Задачи/[D]Отчёт.md'), contents);
});
test('duplicate file is rejected without invoking rename', async () => {
 let calls = 0;
 await assert.rejects(moveTaskFile({path:'A/Задача.md',name:'Задача.md'}, 'B', () => true, async () => { calls++; }), /уже есть/);
 assert.equal(calls, 0);
});
test('dropping in the same folder is a no-op', async () => {
 let calls = 0;
 assert.equal(await moveTaskFile({path:'A/Задача.md',name:'Задача.md'}, 'A', () => true, async () => { calls++; }), false);
 assert.equal(calls, 0);
});
test('rename failures propagate without a second mutation attempt', async () => {
 let calls = 0;
 await assert.rejects(moveTaskFile({path:'A/Задача.md',name:'Задача.md'}, 'B', () => false, async () => { calls++; throw new Error('disk failure'); }), /disk failure/);
 assert.equal(calls, 1);
});
