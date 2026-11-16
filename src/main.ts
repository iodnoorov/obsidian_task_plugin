import { sortTasks, reorderTasks } from './order';
import { moveTaskFile } from './move';
import { App, ItemView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, WorkspaceLeaf, normalizePath, setIcon } from 'obsidian';
import { filePath, isDone, taskTitle, toggledName, validateTitle, localDay, validDay, shiftDay, taskDates, visibleOn } from './tasks';
const VIEW = 'folder-task-board';
function dateControl(parent: HTMLElement, value: string, label: string, onChange: (value: string) => void) {
 const group = parent.createDiv('ftb-date-control');
 const text = group.createEl('input', { type: 'text', attr: { 'aria-label': label, placeholder: 'дд.мм.гггг', inputmode: 'numeric' } });
 const format = (day: string) => day.split('-').reverse().join('.');
 text.value = format(value);
 const calendar = group.createDiv('ftb-calendar');
 setIcon(calendar, 'calendar');
 const picker = calendar.createEl('input', { type: 'date', attr: { 'aria-label': `Выбрать дату: ${label}` } });
 picker.value = value;
 const apply = (day: string) => { value = day; picker.value = day; text.value = format(day); text.setCustomValidity(''); onChange(day); };
 picker.onchange = () => { if (validDay(picker.value)) apply(picker.value); };
 const commit = () => {
  const day = text.value.trim().split('.').reverse().join('-');
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(text.value.trim()) && validDay(day)) apply(day);
  else { text.setCustomValidity('Введите дату в формате дд.мм.гггг'); text.reportValidity(); onChange(''); }
 };
 text.onchange = commit;
 text.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commit(); } };
}
interface Column { title: string; folder: string; color?: string }
const COLUMN_COLOR = '#7891b2';
function columnColor(column: Column): string { return /^#[0-9a-f]{6}$/i.test(column.color ?? '') ? column.color! : COLUMN_COLOR; }
interface Options { width: number; columns: Column[]; order: string[] }
export default class TaskPlugin extends Plugin {
 selectedDate = localDay();
 draggedTask: TFile | null = null;
 private saveQueue: Promise<void> = Promise.resolve();
 private toggling = new Set<TFile>();
 options: Options = { width: 3, columns: [], order: [] };
 async onload() {
  const saved = await this.loadData();
  this.options = { order: Array.isArray(saved?.order) ? saved.order.filter((path: unknown) => typeof path === 'string') : [], width: Math.max(1, Math.min(6, Math.round(Number(saved?.width) || 3))), columns: Array.isArray(saved?.columns) ? saved.columns.filter((c: Column) => typeof c?.title === 'string' && typeof c?.folder === 'string') : [] };
  this.registerView(VIEW, leaf => new Board(leaf, this));
  this.addRibbonIcon('list-checks', 'Открыть задачи', () => { void this.openBoard(); });
  this.addCommand({ id: 'open-board', name: 'Открыть задачи', callback: () => this.openBoard() });
  this.addCommand({ id: 'create-task', name: 'Создать задачу', callback: () => new CreateTask(this).open() });
  this.addCommand({ id: 'selection-to-task', name: 'Создать задачу из выделения', editorCallback: editor => new CreateTask(this, editor.getSelection()).open() });
  this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor) => {
   const selection = editor.getSelection();
   if (selection.trim()) menu.addItem(item => item.setTitle('Новая задача из выделения').setIcon('list-plus').onClick(() => new CreateTask(this, selection).open()));
  }));
  this.addSettingTab(new BoardSettings(this.app, this));
  const refresh = () => this.refresh();
  this.registerEvent(this.app.vault.on('create', refresh));
  this.registerEvent(this.app.vault.on('delete', refresh));
  this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
   this.options.order = this.options.order.map(path => path === oldPath ? file.path : path.startsWith(oldPath + '/') ? file.path + path.slice(oldPath.length) : path);
   void this.save().catch(error => new Notice(String(error)));
  }));
  this.registerEvent(this.app.metadataCache.on('changed', refresh));
 }
 async openBoard() {
  let leaf = this.app.workspace.getLeavesOfType(VIEW)[0];
  if (!leaf) { leaf = this.app.workspace.getLeaf('tab'); await leaf.setViewState({ type: VIEW, active: true }); }
  await this.app.workspace.revealLeaf(leaf);
 }
 refresh() { for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) if (leaf.view instanceof Board) leaf.view.render(); }
 async save() {
  const snapshot = JSON.parse(JSON.stringify(this.options));
  const pending = this.saveQueue.catch(() => {}).then(() => this.saveData(snapshot));
  this.saveQueue = pending;
  await pending;
  this.refresh();
 }
 async reorder(file: TFile, target?: TFile, after = false) {
  if (!file.parent) return;
  const tasks = file.parent.children.filter((f): f is TFile => f instanceof TFile && f.extension === 'md');
  const paths = new Set(tasks.map(task => task.path));
  this.options.order = [...this.options.order.filter(path => !paths.has(path)), ...reorderTasks(tasks, this.options.order, file, target, after)];
  await this.save();
 }
 async moveTask(file: TFile, column: Column, target?: TFile, after = false) {
  if (this.toggling.has(file)) throw new Error('Дождитесь завершения операции с задачей.');
  const folder = column.folder ? this.app.vault.getAbstractFileByPath(column.folder) : null;
  if (!(folder instanceof TFolder)) throw new Error('Папка колонки не найдена. Проверьте настройки.');
  if (this.app.vault.getAbstractFileByPath(file.path) !== file) throw new Error('Задача больше не существует.');
  this.toggling.add(file);
  try {
   await moveTaskFile(file, folder.path, path => this.app.vault.getAbstractFileByPath(path) !== null,
    path => this.app.fileManager.renameFile(file, path));
   await this.reorder(file, target, after);
  } finally { this.toggling.delete(file); this.refresh(); }
 }
 async toggle(file: TFile) {
  if (this.toggling.has(file)) return;
  const done = !isDone(file.basename);
  const name = toggledName(file.basename);
  if (!name) throw new Error('После удаления [D] название будет пустым.');
  const target = filePath(file.parent?.path === '/' ? '' : file.parent?.path ?? '', name);
  if (this.app.vault.getAbstractFileByPath(target)) throw new Error('Заметка с таким названием уже существует.');
  this.toggling.add(file);
  const original = file.path;
  try {
   await this.app.fileManager.renameFile(file, target);
   try {
    await this.app.fileManager.processFrontMatter(file, fm => {
     if (!validDay(fm.task_date)) fm.task_date = localDay(new Date(file.stat.ctime));
     if (done) fm.task_closed = localDay();
     else delete fm.task_closed;
    });
   } catch (error) {
    await this.app.fileManager.renameFile(file, original);
    throw error;
   }
   if (done) await this.reorder(file);
  } finally { this.toggling.delete(file); this.refresh(); }
 }
}
class Board extends ItemView {
 constructor(leaf: WorkspaceLeaf, private plugin: TaskPlugin) { super(leaf); }
 getViewType() { return VIEW; }
 getDisplayText() { return 'Задачи'; }
 getIcon() { return 'list-checks'; }
 async onOpen() { this.render(); }
 render() {
  const root = this.contentEl; root.empty(); root.addClass('ftb-view');
  const toolbar = root.createDiv('ftb-toolbar'); toolbar.createEl('h2', { text: 'Задачи' });
  toolbar.createEl('button', { text: 'Новая задача' }).onclick = () => new CreateTask(this.plugin).open();
  const navigation = root.createDiv('ftb-date-nav');
  const changeDate = (day: string) => { if (validDay(day)) { this.plugin.selectedDate = day; this.plugin.refresh(); } };
  navigation.createEl('button', { text: '←', attr: { 'aria-label': 'Предыдущий день' } }).onclick = () => changeDate(shiftDay(this.plugin.selectedDate, -1));
  dateControl(navigation, this.plugin.selectedDate, 'Дата списка задач', changeDate);
  navigation.createEl('button', { text: '→', attr: { 'aria-label': 'Следующий день' } }).onclick = () => changeDate(shiftDay(this.plugin.selectedDate, 1));
  navigation.createEl('button', { text: 'Сегодня' }).onclick = () => changeDate(localDay());
  if (!this.plugin.options.columns.length) { root.createEl('p', { text: 'Добавьте колонки и папки в настройках Folder Task Board.' }); return; }
  const grid = root.createDiv('ftb-grid'); grid.style.setProperty('--ftb-columns', String(this.plugin.options.width));
  for (const column of this.plugin.options.columns) {
   const section = grid.createEl('section', { cls: 'ftb-column' });
   section.style.setProperty('--ftb-color', columnColor(column));
   const canDrop = () => this.plugin.draggedTask !== null;
   section.ondragover = event => {
    if (!canDrop()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    section.addClass('is-drop-target');
   };
   section.ondragleave = event => {
    if (!(event.relatedTarget instanceof Node) || !section.contains(event.relatedTarget)) section.removeClass('is-drop-target');
   };
   section.ondrop = event => {
    if (!canDrop()) return;
    event.preventDefault(); event.stopPropagation();
    section.removeClass('is-drop-target');
    const file = this.plugin.draggedTask!;
    this.plugin.draggedTask = null;
    void this.plugin.moveTask(file, column).catch(error => new Notice(error instanceof Error ? error.message : String(error)));
   };
   const header = section.createDiv('ftb-column-header'); header.createEl('h3', { text: column.title || column.folder });
   const add = header.createEl('button', { cls: 'ftb-add', attr: { 'aria-label': `Создать задачу: ${column.title}` } });
   setIcon(add, 'plus');
   add.onclick = () => new CreateTask(this.plugin, '', column).open();
   const folder = column.folder ? this.app.vault.getAbstractFileByPath(column.folder) : null;
   if (!(folder instanceof TFolder)) { section.createEl('p', { text: 'Папка не найдена. Проверьте настройки.', cls: 'ftb-muted' }); continue; }
   const files = sortTasks(folder.children.filter((f): f is TFile => f instanceof TFile && f.extension === 'md'), this.plugin.options.order).filter(file => {
    const dates = taskDates(this.app.metadataCache.getFileCache(file)?.frontmatter, file.stat.ctime, file.stat.mtime, isDone(file.basename));
    return visibleOn(this.plugin.selectedDate, dates.start, dates.closed);
   });
   header.createSpan({ text: String(files.length), cls: 'ftb-count', attr: { 'aria-label': `Задач: ${files.length}` } });
   if (!files.length) section.createEl('p', { text: 'Задач пока нет', cls: 'ftb-muted' });
   for (const file of files) {
    const row = section.createDiv({ cls: `ftb-task${isDone(file.basename) ? ' is-done' : ''}` });
    row.draggable = true;
    const clearMarkers = () => root.querySelectorAll('.ftb-drop-before, .ftb-drop-after').forEach(element => element.removeClass('ftb-drop-before', 'ftb-drop-after'));
    row.ondragover = event => {
     const dragged = this.plugin.draggedTask;
     if (!dragged || dragged === file || isDone(dragged.basename) !== isDone(file.basename)) return;
     event.preventDefault(); event.stopPropagation();
     if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
     clearMarkers();
     row.addClass(event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2 ? 'ftb-drop-after' : 'ftb-drop-before');
    };
    row.ondragleave = event => {
     if (!(event.relatedTarget instanceof Node) || !row.contains(event.relatedTarget)) row.removeClass('ftb-drop-before', 'ftb-drop-after');
    };
    row.ondrop = event => {
     const dragged = this.plugin.draggedTask;
     if (!dragged) return;
     if (dragged === file) { event.preventDefault(); event.stopPropagation(); clearMarkers(); return; }
     if (isDone(dragged.basename) !== isDone(file.basename)) return;
     event.preventDefault(); event.stopPropagation();
     const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
     clearMarkers(); section.removeClass('is-drop-target');
     this.plugin.draggedTask = null;
     void this.plugin.moveTask(dragged, column, file, after).catch(error => new Notice(error instanceof Error ? error.message : String(error)));
    };
    row.ondragstart = event => {
     if (!event.dataTransfer) return;
     this.plugin.draggedTask = file;
     event.dataTransfer.effectAllowed = 'move';
     event.dataTransfer.setData('text/plain', file.path);
     row.addClass('is-dragging');
    };
    row.ondragend = () => {
     this.plugin.draggedTask = null;
     row.removeClass('is-dragging');
     clearMarkers();
     root.querySelectorAll('.is-drop-target').forEach(element => element.removeClass('is-drop-target'));
    };
    const checkbox = row.createEl('input', { type: 'checkbox', attr: { 'aria-label': `Выполнено: ${taskTitle(file.basename)}` } }); checkbox.checked = isDone(file.basename);
    checkbox.onchange = async () => { checkbox.disabled = true; try { await this.plugin.toggle(file); } catch (e) { new Notice(String(e instanceof Error ? e.message : e)); this.render(); } };
    const link = row.createEl('a', { text: taskTitle(file.basename), href: file.path, cls: 'ftb-task-link' });
    link.draggable = false;
    link.onclick = e => { e.preventDefault(); void this.app.workspace.getLeaf(e.ctrlKey || e.metaKey).openFile(file); };
   }
  }
 }
}
class CreateTask extends Modal {
 constructor(private plugin: TaskPlugin, private initial = '', private selected?: Column) { super(plugin.app); }
 onOpen() {
  this.titleEl.setText('Новая задача');
  if (!this.plugin.options.columns.length) { this.contentEl.createEl('p', { text: 'Сначала добавьте колонку в настройках плагина.' }); return; }
  let date = this.plugin.selectedDate;
  let title = this.initial; let index = Math.max(0, this.plugin.options.columns.indexOf(this.selected!)); let busy = false;
  new Setting(this.contentEl).setName('Название').addText(text => { text.setValue(title).onChange(value => title = value); text.inputEl.focus(); });
  new Setting(this.contentEl).setName('Колонка').addDropdown(drop => { this.plugin.options.columns.forEach((c,i) => drop.addOption(String(i), c.title || c.folder)); drop.setValue(String(index)).onChange(value => index = Number(value)); });
  const dateSetting = new Setting(this.contentEl).setName('Дата задачи');
  dateControl(dateSetting.controlEl, date, 'Дата задачи', value => date = value);
  const error = this.contentEl.createEl('p', { cls: 'ftb-error', attr: { role: 'alert' } });
  const submit = async () => {
   if (busy) return;
   busy = true; button.disabled = true; error.setText('');
   try {
    if (!validDay(date)) throw new Error('Укажите корректную дату задачи.');
    const name = validateTitle(title); const column = this.plugin.options.columns[index];
    if (!column || !column.folder || !(this.app.vault.getAbstractFileByPath(column.folder) instanceof TFolder)) throw new Error('Папка колонки не найдена. Проверьте настройки.');
    const path = filePath(column.folder, name);
    if (this.app.vault.getAbstractFileByPath(path)) throw new Error('Задача с таким названием уже существует.');
    const file = await this.app.vault.create(path, `---\ntask_date: '${date}'\n---\n`);
    this.close(); await this.app.workspace.getLeaf(false).openFile(file);
   } catch (e) { error.setText(e instanceof Error ? e.message : String(e)); }
   finally { busy = false; button.disabled = false; }
  };
  const button = this.contentEl.createEl('button', { text: 'Создать', cls: 'mod-cta' }); button.onclick = () => { void submit(); };
  this.contentEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); void submit(); } });
 }
 onClose() { this.contentEl.empty(); }
}
class BoardSettings extends PluginSettingTab {
 constructor(app: App, private plugin: TaskPlugin) { super(app, plugin); }
 display() {
  this.containerEl.empty();
  new Setting(this.containerEl).setName('Колонок в ряду').setDesc('От 1 до 6. Остальные колонки переносятся на следующую строку.').addDropdown(drop => { for (let i=1;i<=6;i++) drop.addOption(String(i), String(i)); drop.setValue(String(this.plugin.options.width)).onChange(async value => { this.plugin.options.width = Number(value); await this.plugin.save(); }); });
  this.containerEl.createEl('p', { text: 'Каждая колонка показывает Markdown-заметки непосредственно из выбранной папки. Например: Проект → Работа/Проект/Задачи. Папка должна уже существовать.' });
  const moveColumn = async (index: number, offset: number) => {
   const columns = this.plugin.options.columns;
   const target = index + offset;
   if (target < 0 || target >= columns.length) return;
   [columns[index], columns[target]] = [columns[target], columns[index]];
   await this.plugin.save();
   this.display();
  };
  this.plugin.options.columns.forEach((column, index) => {
   new Setting(this.containerEl).setName(`Колонка ${index+1}`).addText(text => text.setPlaceholder('Проект').setValue(column.title).onChange(async value => { column.title = value; await this.plugin.save(); })).addText(text => text.setPlaceholder('Работа/Проект/Задачи').setValue(column.folder).onChange(async value => { column.folder = value.trim() ? normalizePath(value.trim()) : ''; await this.plugin.save(); })).addColorPicker(picker => picker.setValue(columnColor(column)).onChange(async value => { column.color = value; await this.plugin.save(); })).addExtraButton(button => button.setIcon('arrow-up').setTooltip('Переместить раньше').setDisabled(index === 0).onClick(() => moveColumn(index, -1))).addExtraButton(button => button.setIcon('arrow-down').setTooltip('Переместить позже').setDisabled(index === this.plugin.options.columns.length - 1).onClick(() => moveColumn(index, 1))).addExtraButton(button => button.setIcon('trash').setTooltip('Удалить колонку').onClick(async () => { this.plugin.options.columns.splice(index,1); await this.plugin.save(); this.display(); }));
  });
  new Setting(this.containerEl).addButton(button => button.setButtonText('Добавить колонку').onClick(async () => { this.plugin.options.columns.push({ title: '', folder: '', color: COLUMN_COLOR }); await this.plugin.save(); this.display(); }));
 }
}
