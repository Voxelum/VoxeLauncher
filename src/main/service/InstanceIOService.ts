import { copyPassively, exists, isDirectory, isFile, readdirIfPresent } from '@main/util/fs';
import { getCurseforgeUrl } from '@main/util/resource';
import { openCompressedStreamTask } from '@main/util/zip';
import { createTemplate, InstanceConfig } from '@universal/store/modules/instance';
import { InstanceSchema } from '@universal/store/modules/instance.schema';
import { LocalVersion } from '@universal/store/modules/version';
import { isNonnull, requireObject, requireString } from '@universal/util/assert';
import { Exception } from '@universal/util/exception';
import { MinecraftFolder, Version } from '@xmcl/core';
import { CurseforgeInstaller } from '@xmcl/installer';
import { Task } from '@xmcl/task';
import { createExtractStream } from '@xmcl/unzip';
import { createReadStream, ensureDir, mkdtemp, readdir, readJson, remove, stat } from 'fs-extra';
import { tmpdir } from 'os';
import { basename, join, relative, resolve } from 'path';
import { CurseforgeModpackManifest } from './CurseForgeService';
import InstanceResourceService from './InstanceResourceService';
import InstanceService, { EditInstanceOptions } from './InstanceService';
import ResourceService from './ResourceService';
import Service, { Inject, Singleton } from './Service';
import VersionService from './VersionService';

export interface InstanceFile { path: string; isDirectory: boolean; isResource: boolean }

export interface ExportInstanceOptions {
    /**
     * The src path of the instance
     */
    src?: string;
    /**
     * The dest path of the exported instance
     */
    destinationPath: string;

    /**
     * Does this export include the libraries?
     * @default true
     */
    includeLibraries?: boolean;

    /**
     * Does this export includes assets?
     * @default true
     */
    includeAssets?: boolean;

    /**
     * Does this export includes the minecraft version jar? (like <minecraft>/versions/1.14.4.jar).
     * If this is false, then it will only export with version json.
     * @default true
     */
    includeVersionJar?: boolean;

    /**
     * If this is present, it will only exports the file paths in this array.
     * By default this is `undefined`, and it will export everything in the instance.
     */
    files?: string[];
}

export interface ExportCurseforgeModpackOptions {
    /**
     * An list of files should be included in overrides
     */
    overrides: string[];
    /**
     * The instance path to be exported
     */
    instancePath?: string;
    /**
    * The dest path of the exported instance
    */
    destinationPath: string;

    name: string;

    version: string;

    author: string;

    gameVersion: string;
}

export interface ImportCurseforgeModpackOptions {
    /**
     * The path of modpack
     */
    path: string;
    /**
     * The destination instance path. If this is empty, it will create a new instance.
     */
    instancePath?: string;
}

export default class InstanceIOService extends Service {
    @Inject('ResourceService')
    private resourceService!: ResourceService;

    @Inject('InstanceService')
    private instanceService!: InstanceService;

    @Inject('InstanceResourceService')
    private instanceResourceService!: InstanceResourceService;

    @Inject('VersionService')
    private versionService!: VersionService;

    /**
     * Export current instance as a modpack. Can be either curseforge or normal full Minecraft
     * @param options The export instance options
     */
    @Singleton('instance')
    async exportInstance(options: ExportInstanceOptions) {
        requireObject(options);

        const { src = this.state.instance.path, destinationPath: dest, includeAssets = true, includeLibraries = true, files, includeVersionJar = true } = options;

        if (!this.state.instance.all[src]) {
            this.warn(`Cannot export unmanaged instance ${src}`);
            return;
        }

        const root = this.state.root;
        const from = src;

        const { task, include, add, end } = openCompressedStreamTask(dest);
        (task as any).name = 'profile.modpack.export';
        const handle = this.submit(task);

        const version = await Version.parse(root, this.getters.instanceVersion.folder);

        // add assets
        if (includeAssets) {
            const assetsJson = resolve(root, 'assets', 'indexes', `${version.assets}.json`);
            await add(assetsJson, `assets/indexes/${version.assets}.json`);
            const objects = await readJson(assetsJson).then(manifest => manifest.objects);
            for (const hash of Object.keys(objects).map(k => objects[k].hash)) {
                await add(resolve(root, 'assets', 'objects', hash.substring(0, 2), hash), `assets/objects/${hash.substring(0, 2)}/${hash}`);
            }
        }

        // add version json and jar
        const verionsChain = version.pathChain;
        for (const versionPath of verionsChain) {
            const versionId = basename(versionPath);
            if (includeVersionJar && await exists(join(versionPath, `${versionId}.jar`))) {
                await add(join(versionPath, `${versionId}.jar`), `versions/${versionId}/${versionId}.jar`);
            }
            await add(join(versionPath, `${versionId}.json`), `versions/${versionId}/${versionId}.json`);
        }

        // add libraries
        if (includeLibraries) {
            for (const lib of version.libraries) {
                await add(resolve(root, 'libraries', lib.download.path),
                    `libraries/${lib.download.path}`);
            }
        }

        // add misc files like config, log...
        if (files) {
            for (const file of files) {
                await add(join(src, file), file);
            }
        } else {
            await include(from, from);
        }

        end();

        await handle.wait();
    }

    /**
     * Scan all the files under the current instance.
     * It will hint if a mod resource is in curseforge
     */
    async getInstanceFiles(): Promise<InstanceFile[]> {
        const path = this.state.instance.path;
        const files = [] as InstanceFile[];

        const scan = async (p: string) => {
            const status = await stat(p);
            const ino = status.ino;
            const isDirectory = status.isDirectory();
            const isResource = !!this.resourceService.getResourceByKey(ino)?.source.curseforge;
            files.push({ isDirectory, path: relative(path, p).replace(/\\/g, '/'), isResource });
            if (isDirectory) {
                let childs = await readdirIfPresent(p);
                for (let child of childs) {
                    await scan(join(p, child));
                }
            }
        };

        await scan(path);
        files.shift();

        return files;
    }

    /**
     * Export the instance as an curseforge modpack
     * @param options The curseforge modpack export options
     */
    async exportCurseforge(options: ExportCurseforgeModpackOptions) {
        requireObject(options);

        let { instancePath = this.state.instance.path, destinationPath, overrides, name, version, gameVersion, author } = options;

        if (!this.state.instance.all[instancePath]) {
            this.warn(`Cannot export unmanaged instance ${instancePath}`);
            return;
        }

        const ganeVersionInstance = this.state.version.local.find(v => v.folder === gameVersion);
        const instance = this.state.instance.all[instancePath];
        const modLoaders = ganeVersionInstance?.forge ? [{
            id: `forge-${ganeVersionInstance?.forge}`,
            primary: true,
        }] : [];
        const curseforgeConfig: CurseforgeModpackManifest = {
            manifestType: 'minecraftModpack',
            manifestVersion: 1,
            minecraft: {
                version: ganeVersionInstance?.minecraft ?? instance.runtime.minecraft,
                modLoaders,
            },
            name: options.name ?? name,
            version,
            author: author ?? instance.author,
            files: [],
            overrides: 'overrides',
        };

        for (const mod of this.state.instance.mods) {
            if (!mod.source.curseforge) {
                // add to override
            } else {
                curseforgeConfig.files.push({ projectID: mod.source.curseforge.projectId, fileID: mod.source.curseforge.fileId, required: true });
            }
        }

        const { task, add, addBuffer, addEmptyDirectory, end } = openCompressedStreamTask(destinationPath);

        addEmptyDirectory('overrides');

        for (let file of overrides) {
            await add(join(instancePath, file), `overrides/${file}`);
        }

        addBuffer(Buffer.from(JSON.stringify(curseforgeConfig)), 'manifest.json');

        end();

        const handle = this.submit(task);
        await handle.wait();
    }

    /**
     * Link a existed instance on you disk.
     * @param path 
     */
    async linkInstance(path: string) {
        if (this.state.instance.all[path]) {
            this.log(`Skip to link already managed instance ${path}`);
            return false;
        }
        let loaded = await this.instanceService.loadInstance(path);
        if (!loaded) {
            await this.instanceService.createInstance({ path });
        }

        // copy assets, library and versions
        await copyPassively(resolve(path, 'assets'), this.getPath('assets'));
        await copyPassively(resolve(path, 'libraries'), this.getPath('libraries'));
        await copyPassively(resolve(path, 'versions'), this.getPath('versions'));

        return true;
    }

    /**
     * Import an instance from a game zip file. The zip file root must be the game directory, or it must contains the `.minecraft` directory.
     * @param location The zip or directory path
     */
    async importInstance(location: string) {
        requireString(location);

        let isDir = await isDirectory(location);
        let srcDirectory = location;

        if (!isDir) {
            srcDirectory = await mkdtemp(join(tmpdir(), 'launcher'));
            await createReadStream(location)
                .pipe(createExtractStream(srcDirectory))
                .wait();
        }

        // check if this game contains the instance.json from us
        let instanceTemplate: InstanceConfig;

        let instanceConfigPath = resolve(srcDirectory, 'instance.json');
        let isExportFromUs = await isFile(instanceConfigPath);
        if (isExportFromUs) {
            instanceTemplate = await this.getPersistence({ path: instanceConfigPath, schema: InstanceSchema });
        } else {
            instanceTemplate = createTemplate();
            instanceTemplate.creationDate = Date.now();

            const dir = new MinecraftFolder(srcDirectory);
            const versions = await readdir(dir.versions);
            const localVersion: LocalVersion = {} as any;
            for (const ver of versions) {
                Object.assign(localVersion, await this.versionService.resolveLocalVersion(ver, dir.root));
            }
            delete localVersion.id;
            delete localVersion.folder;
            instanceTemplate.runtime = localVersion;
        }


        // create instance
        const instancePath = await this.instanceService.createInstance(instanceTemplate);


        // start copy from src to instance
        await copyPassively(srcDirectory, instancePath, (path) => {
            if (path.endsWith('/versions')) return false;
            if (path.endsWith('/assets')) return false;
            if (path.endsWith('/libraries')) return false;
            return true;
        });

        // copy assets, library and versions
        await copyPassively(resolve(srcDirectory, 'assets'), this.getPath('assets'));
        await copyPassively(resolve(srcDirectory, 'libraries'), this.getPath('libraries'));
        await copyPassively(resolve(srcDirectory, 'versions'), this.getPath('versions'));

        if (!isDir) { await remove(srcDirectory); }
    }

    async importCurseforgeModpack(options: ImportCurseforgeModpackOptions) {
        let { path, instancePath } = options;

        if (!await isFile(path)) {
            throw new Exception({ type: 'requireCurseforgeModpackAFile', path }, `Cannot import curseforge modpack ${path}, since it's not a file!`);
        }

        this.log(`Import curseforge modpack by path ${path}`);
        const installCurseforgeModpack = Task.create('installCurseforgeModpack', async (ctx: Task.Context) => {
            let manifest = await ctx.execute(CurseforgeInstaller.readManifestTask(path)).catch(() => {
                throw new Exception({ type: 'invalidCurseforgeModpack', path });
            });

            let forgeId = manifest.minecraft.modLoaders.find(l => l.id.startsWith('forge'));

            let config: EditInstanceOptions = {
                runtime: {
                    minecraft: manifest.minecraft.version,
                    forge: forgeId ? forgeId.id.substring(6) : '',
                    liteloader: '',
                    fabricLoader: '',
                    yarn: '',
                },
            };

            if (instancePath) {
                await this.instanceService.editInstance({
                    instancePath,
                    ...config,
                });
            } else {
                instancePath = await this.instanceService.createInstance({
                    name: manifest.name,
                    author: manifest.author,
                    ...config,
                });
            }

            // deploy existed resources
            const filesToDeploy = manifest.files
                .map((f) => this.resourceService.getResourceByKey(getCurseforgeUrl(f.projectID, f.fileID)))
                .filter(isNonnull);
            await ensureDir(join(instancePath, 'mods'));
            await ensureDir(join(instancePath, 'resourcepacks'));
            await this.instanceResourceService.deploy({ resources: filesToDeploy, path: instancePath });

            // filter out existed resources
            manifest.files = manifest.files.filter((f) => {
                let resource = this.resourceService.getResourceByKey(getCurseforgeUrl(f.projectID, f.fileID));
                return !resource;
            });

            let files: Array<{ path: string; projectID: number; fileID: number; url: string }> = [];
            let defaultQuery = CurseforgeInstaller.createDefaultCurseforgeQuery();
            await CurseforgeInstaller.installCurseforgeModpackTask(path, instancePath, {
                manifest,
                async queryFileUrl(projectId: number, fileId: number) {
                    let result = await defaultQuery(projectId, fileId);
                    files.push({ path: '', projectID: projectId, fileID: fileId, url: result });
                    return result;
                },
                filePathResolver(p, f, m, u) {
                    let path = m.getMod(basename(u));
                    files.find(fi => fi.fileID === f)!.path = path;
                    return path;
                },
            }).run(ctx);

            await this.resourceService.importResources(files.map((f) => ({
                filePath: f.path,
                url: [f.url, getCurseforgeUrl(f.projectID, f.fileID)],
                source: {
                    curseforge: { projectId: f.projectID, fileId: f.fileID },
                },
            })));
            return instancePath;
        });
        return this.submit(installCurseforgeModpack).wait();
    }
}
