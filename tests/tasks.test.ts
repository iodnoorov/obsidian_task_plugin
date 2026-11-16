import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filePath, isDone, taskTitle, toggledName, validateTitle, visibleOn, validDay, localDay, shiftDay, taskDates } from '../src/tasks';
test('completion prefix is reversible and only recognized at the start', () => {
 assert.equal(toggledName('Отчёт'), '[D]Отчёт');
 assert.equal(toggledName('[D]Отчёт'), 'Отчёт');
 assert.equal(isDone('Отчёт [D]'), false);
 assert.equal(taskTitle('[D]Отчёт'), 'Отчёт');
});
test('task names cannot escape folder or contain invalid file characters', () => {
 for (const value of ['', ' ', '..', '../file', 'a/b', 'a\\b', 'a\nb', 'a:b', 'a.', '[D]Отчёт']) assert.throws(() => validateTitle(value));
 assert.equal(validateTitle('  Отчёт проекта  '), 'Отчёт проекта');
 assert.equal(filePath('Работа/Проект/Задачи', 'Отчёт'), 'Работа/Проект/Задачи/Отчёт.md');
 assert.equal(filePath('', 'Отчёт'), 'Отчёт.md');
});

test('unfinished tasks carry forward; closed day is included', () => {
 assert.equal(visibleOn('2026-11-15', '2026-11-16'), false);
 assert.equal(visibleOn('2026-11-16', '2026-11-16'), true);
 assert.equal(visibleOn('2027-01-01', '2026-11-16'), true);
 assert.equal(visibleOn('2026-11-17', '2026-11-16', '2026-11-18'), true);
 assert.equal(visibleOn('2026-11-18', '2026-11-16', '2026-11-18'), true);
 assert.equal(visibleOn('2026-11-19', '2026-11-16', '2026-11-18'), false);
});
test('dates validate real calendar days and step over month/year boundaries', () => {
 for (const value of ['2026-02-29', '2026-11-31', '', '16.11.2026', undefined]) assert.equal(validDay(value), false);
 assert.equal(validDay('2028-02-29'), true);
 assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
 assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
 assert.equal(localDay(new Date(2026, 10, 16, 0, 1)), '2026-11-16');
});
test('legacy notes use file dates; reopening ignores stale closed field', () => {
 const created = new Date(2026,10,10).getTime(), modified = new Date(2026,10,14).getTime();
 assert.deepEqual(taskDates(undefined, created, modified, true), {start:'2026-11-10',closed:'2026-11-14'});
 assert.deepEqual(taskDates({task_date:'2026-11-11', task_closed:'2026-11-13'}, created, modified, false), {start:'2026-11-11',closed:undefined});
 assert.deepEqual(taskDates({task_date:'2026-11-11', task_closed:'2026-11-13'}, created, modified, true), {start:'2026-11-11',closed:'2026-11-13'});
});
