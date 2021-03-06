import { findLevelRootOnPath, getInstanceSave, loadInstanceSaveMetadata } from '@main/entities/save';
import { copyPassively, isFile, missing, readdirIfPresent } from '@main/util/fs';
import { unpack7z, ZipTask } from '@main/util/zip';
import { Exception } from '@universal/entities/exception';
import { InstanceSave } from '@universal/entities/save';
import { isNonnull, requireObject, requireString } from '@universal/util/assert';
import { createHash } from 'crypto';
import filenamify from 'filenamify';
import { ensureDir, ensureFile, FSWatcher, readdir, remove } from 'fs-extra';
import watch from 'node-watch';
import { basename, extname, join, resolve } from 'path';
import { ZipFile } from 'yazl';
import Service, { MutationTrigger, ServiceException, Singleton } from './Service';

export interface ExportSaveOptions {
    /**
     * The instance directory path, e.g. the path of .minecraft folder.
     * 
     * This will be the active instance by default.
     */
    instancePath?: string;
    /**
     * The save folder name to export.
     */
    saveName: string;
    /**
     * The destination full file path.
     */
    destination: string;
    /**
     * Should export as zip
     * @default true
     */
    zip?: boolean;
}

export interface ImportSaveOptions {
    /**
     * The source path of the zip or folder of the save to import
     */
    source: string;
    /**
     * The destination instance directory path, e.g. the path of .minecraft folder.
     * 
     * This will be the active instance by default.
     */
    instancePath?: string;
    /**
     * The destination save folder name will be imported into.
     * 
     * It will be the basename of the source file path if this is not present.
     */
    saveName?: string;
}

export interface DeleteSaveOptions {
    /**
     * The save name will be deleted
     */
    saveName: string;

    /**
     * The instance path of this save. If this is not presented, it will use selected instance.
     */
    instancePath?: string;
}

export interface CloneSaveOptions {
    /**
     * The source instance path. If it is not presented, it will use selected instance.
     */
    srcInstancePath?: string;

    /**
     * The destination instance path. If it is not presented, it will use selected instance.
     */
    destInstancePath?: string | string[];

    /**
     * The save name to clone
     */
    saveName: string;

    /**
     * The new save name.
     * @default Generated name from the `saveName`
     */
    newSaveName?: string;
}

/**
 * Provide the ability to preview saves data of an instance
 */
export default class InstanceSavesService extends Service {
    private watcher: FSWatcher | undefined;

    private watching = '';

    async init() {
        this.mountInstanceSaves(this.state.instance.path);
    }

    async dispose() {
        if (this.watcher) {
            this.watcher.close();
        }
    }

    /**
     * Load all registered instances' saves metadata
     */
    @Singleton()
    async loadAllInstancesSaves() {
        let all: Array<InstanceSave> = [];

        for (let instance of this.getters.instances) {
            let saveRoot = join(instance.path, 'saves');
            let saves = await readdirIfPresent(saveRoot).then(a => a.filter(s => !s.startsWith('.')));
            let metadatas = saves
                .map(s => resolve(saveRoot, s))
                .map((p) => getInstanceSave(p, instance.name));
            all.push(...metadatas);
        }
        return all;
    }

    @MutationTrigger('instanceSelect')
    protected onInstance(payload: string) {
        this.mountInstanceSaves(payload);
    }

    /**
     * Mount and load instances saves
     * @param path 
     */
    @Singleton()
    async mountInstanceSaves(path: string) {
        requireString(path);

        let savesDir = join(path, 'saves');

        if (this.watching === savesDir) {
            return;
        }

        if (this.watcher) {
            this.watcher.close();
        }

        this.log(`Mount saves directory: ${savesDir}`);

        await ensureDir(savesDir);
        try {
            const savePaths = await readdir(savesDir);
            const saves = await Promise.all(savePaths
                .filter((d) => !d.startsWith('.'))
                .map((d) => join(savesDir, d))
                .map((p) => loadInstanceSaveMetadata(p, this.getters.instance.name).catch((e) => {
                    this.warn(`Parse save in ${p} failed. Skip it.`);
                    this.warn(e);
                    return undefined;
                })));

            this.log(`Found ${saves.length} saves in instance ${path}`);
            this.commit('instanceSaves', saves.filter(isNonnull));
        } catch (e) {
            throw new ServiceException({ type: 'fsError', ...e }, `An error ocurred during parsing the save of ${path}`);
        }

        this.watching = savesDir;
        this.watcher = watch(savesDir, (event, filename) => {
            if (filename.startsWith('.')) return;
            let filePath = filename;
            if (event === 'update') {
                if (this.state.instance.saves.every((s) => s.path !== filename)) {
                    loadInstanceSaveMetadata(filePath, this.getters.instance.name).then((save) => {
                        this.commit('instanceSaveAdd', save);
                    }).catch((e) => {
                        this.warn(`Parse save in ${filePath} failed. Skip it.`);
                        this.warn(e);
                        return undefined;
                    });
                }
            } else if (this.state.instance.saves.some((s) => s.path === filename)) {
                this.commit('instanceSaveRemove', filePath);
            }
        });
    }

    /**
     * Clone a save under an instance to one or multiple instances.
     *   
     * @param options 
     */
    async cloneSave(options: CloneSaveOptions) {
        let { srcInstancePath, destInstancePath, saveName, newSaveName } = options;

        requireString(saveName);

        srcInstancePath = srcInstancePath ?? this.state.instance.path;
        destInstancePath = destInstancePath ?? [this.state.instance.path];

        let destSaveName = newSaveName ?? saveName;

        let destInstancePaths = typeof destInstancePath === 'string' ? [destInstancePath] : destInstancePath;

        let srcSavePath = join(srcInstancePath, saveName);

        if (await missing(srcSavePath)) {
            throw new ServiceException({ type: 'instanceCopySaveNotFound', src: srcSavePath, dest: destInstancePaths }, `Cancel save copying of ${saveName}`);
        }
        if (!this.state.instance.all[srcInstancePath]) {
            throw new Error(`Cannot find managed instance ${srcInstancePath}`);
        }
        if (destInstancePaths.some(p => !this.state.instance.all[p])) {
            throw new Error(`Cannot find managed instance ${srcInstancePath}`);
        }

        let destSavePaths = destInstancePaths.map(d => join(d, destSaveName));

        for (let dest of destSavePaths) {
            await copyPassively(srcSavePath, dest);
        }
    }

    /**
     * Delete a save in a specific instance.
     * 
     * @param options 
     */
    async deleteSave(options: DeleteSaveOptions) {
        let { saveName, instancePath } = options;

        instancePath = instancePath ?? this.state.instance.path;

        requireString(saveName);

        let savePath = join(instancePath, 'saves', saveName);

        if (await missing(savePath)) {
            throw new Exception({ type: 'instanceDeleteNoSave', name: saveName });
        }

        await remove(savePath);
    }

    /**
     * Import a zip or folder save to the target instance.
     * 
     * If the instancePath is not presented in the options, it will use the current selected instancePath.
     */
    async importSave(options: ImportSaveOptions) {
        let { source, instancePath, saveName } = options;

        requireString(source);

        saveName = saveName ?? basename(source);
        instancePath = instancePath ?? this.state.instance.path;

        if (!this.state.instance.all[instancePath]) {
            throw new Error(`Cannot find managed instance ${instancePath}`);
        }

        // normalize the save name
        saveName = filenamify(saveName);

        let sourceDir = source;
        let destinationDir = join(instancePath, 'saves', basename(saveName, extname(saveName)));
        let useTemp = false;

        if (await isFile(source)) {
            let hash = createHash('sha1').update(source).digest('hex');
            sourceDir = join(this.app.temporaryPath, hash); // save will unzip to the /saves
            await unpack7z(source, sourceDir);
            useTemp = true;
        }

        // validate the source
        let levelRoot = await findLevelRootOnPath(sourceDir);
        if (!levelRoot) {
            throw new Exception({ type: 'instanceImportIllegalSave', path: source });
        }

        await copyPassively(levelRoot, destinationDir);

        if (useTemp) {
            await remove(sourceDir);
        }

        return destinationDir;
    }

    /**
     * Export a save from a managed instance to an external location.
     * 
     * You can choose export the save to zip or a folder.
     * 
     * @param options 
     */
    async exportSave(options: ExportSaveOptions) {
        requireObject(options);

        let { instancePath = this.state.instance.path, saveName, zip = true, destination } = options;

        requireString(saveName);
        requireString(destination);

        let source = join(instancePath, saveName);

        if (!this.state.instance.all[instancePath]) {
            throw new Error(`Cannot find managed instance ${instancePath}`);
        }

        if (await missing(instancePath)) {
            throw new Error(`Cannot find managed instance ${instancePath}`);
        }

        this.log(`Export save from ${instancePath}:${saveName} to ${destination}.`);

        if (!zip) {
            // copy to folder
            await ensureDir(destination);
            await copyPassively(source, destination);
        } else {
            // compress to zip
            await ensureFile(destination);
            const zipTask = new ZipTask(destination);
            await zipTask.includeAs(source, '');
            await zipTask.startAndWait();
        }
    }
}
