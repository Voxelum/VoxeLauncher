import { checksum, pipeline } from '@xmcl/installer/util';
import { access, constants, copyFile, ensureDir, FSWatcher, readdir, stat, watch, remove, unlink, ReadStream } from 'fs-extra';
import { resolve, join } from 'path';
import filenamify from 'filenamify';
import { createHash } from 'crypto';
import { finished } from 'stream';

export { pipeline };

export function missing(file: string) {
    return access(file, constants.F_OK).then(() => false, () => true);
}
export function exists(file: string) {
    return access(file, constants.F_OK).then(() => true, () => false);
}
export function isDirectory(file: string) {
    return stat(file).then((s) => s.isDirectory(), () => false);
}
export function isFile(file: string) {
    return stat(file).then((s) => s.isFile(), () => false);
}
export async function readdirIfPresent(path: string): Promise<string[]> {
    if (!path) throw new Error('Path must not be undefined!');
    return readdir(path).catch((e) => {
        if (e.code === 'ENOENT') return [];
        throw e;
    });
}
export async function readdirEnsured(path: string) {
    if (!path) throw new Error('Path must not be undefined!');
    await ensureDir(path);
    return readdir(path);
}
export function validateSha256(path: string, sha256: string) {
    return checksum(path, 'sha256').then(s => s === sha256, () => false);
}
export { checksum };
/**
 * This copy will not replace existed files.
 */
export async function copyPassively(src: string, dest: string, filter: (name: string) => boolean = () => true) {
    const s = await stat(src).catch(() => { });
    if (!s) { return; }
    if (!filter(src)) { return; }
    if (s.isDirectory()) {
        await ensureDir(dest);
        const childs = await readdir(src);
        await Promise.all(childs.map((p) => copyPassively(resolve(src, p), resolve(dest, p))));
    } else if (await missing(dest)) {
        await copyFile(src, dest);
    }
}
export async function clearDirectoryNarrow(dir: string) {
    let files = await readdir(dir);
    await Promise.all(files.map(async (f) => {
        let file = join(dir, f);
        if (await exists(file) && !(await isDirectory(file))) {
            await unlink(join(dir, f));
        }
    }));
}

export class FileStateWatcher<T> {
    private watcher: FSWatcher | undefined;

    private state: T;

    private watching: string | undefined;

    // eslint-disable-next-line no-useless-constructor
    constructor(private defaultState: T, private handler: (state: T, event: string, file: string) => T) {
        this.state = defaultState;
    }

    public watch(file: string) {
        if (this.watching === file) return false;
        if (this.watcher) { this.watcher.close(); }
        this.watcher = watch(file, (event, file) => {
            this.state = this.handler(this.state, event, file);
        });
        return true;
    }

    public getStateAndReset() {
        const state = this.state;
        this.state = this.defaultState;
        return state;
    }

    close() {
        this.watcher?.close();
    }
}

export function getSuggestedFilename(name: string) {
    name = filenamify(name);
    name = name.replace('§', '');
    return name;
}

export function sha1(data: Buffer) {
    return createHash('sha1').update(data).digest('hex');
}

export function sha1ByPath(path: string) {
    return checksum(path, 'sha1');
}
