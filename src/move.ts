/** Move through the host FileManager so Obsidian can update links. */
export async function moveTaskFile(
 file: { path: string; name: string },
 folder: string,
 exists: (path: string) => boolean,
 rename: (path: string) => Promise<void>,
): Promise<boolean> {
 const target = `${folder === '/' ? '' : folder + '/'}${file.name}`;
 if (target === file.path) return false;
 if (exists(target)) throw new Error('В целевой папке уже есть заметка с таким названием.');
 await rename(target);
 return true;
}
