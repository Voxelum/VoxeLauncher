import { copyPassively, readdirEnsured, sha1 } from '@main/util/fs';
import { commitResourceOnDisk, createResourceBuilder, decorateBuilderFromMetadata, decorateBuilderFromStat, decorateBuilderSourceUrls, decorateBuilderWithPathAndHash, discardResourceOnDisk, getBuilderFromResource, getCurseforgeUrl, getResourceFromBuilder, parseResource, Resource, ResourceBuilder, ResourceRegistryEntry, RESOURCE_ENTRY_FABRIC, RESOURCE_ENTRY_FORGE, RESOURCE_ENTRY_LITELOADER, RESOURCE_ENTRY_MODPACK, RESOURCE_ENTRY_RESOURCE_PACK, RESOURCE_ENTRY_SAVE, SourceInfomation, UNKNOWN_RESOURCE, RESOURCE_ENTRY_COMMON_MODPACK } from '@main/util/resource';
import { CurseforgeSource, ResourceSchema } from '@universal/store/modules/resource.schema';
import { requireString } from '@universal/util/assert';
import { Task, task } from '@xmcl/task';
import { readFile, stat, writeFile } from 'fs-extra';
import { extname, join, basename } from 'path';
import fileType, { FileTypeResult, FileType } from 'file-type';
import Service from './Service';

export type BuiltinType = 'forge' | 'fabric' | 'resourcepack' | 'save' | 'curseforge-modpack';
export type ImportTypeHint = string | '*' | 'mods' | 'forge' | 'fabric' | 'resourcepack' | 'liteloader' | 'curseforge-modpack' | 'save';
export type ImportOption = {
    /**
     * The real file path of the resource
     */
    path: string;
    /**
     * The hint for the import file type
     */
    type?: ImportTypeHint;
    /**
     * The extra info you want to provide to the source of the resource
     */
    source?: SourceInfomation;

    url?: string[];

    background?: boolean;
}
export interface ParseFilesOptions {
    files: { path: string; hint?: ImportTypeHint; size?: number }[];
}
export interface ParseFileResult {
    path: string;
    type: BuiltinType | 'modpack' | 'unknown' | 'directory';
    fileType: FileType | 'unknown' | 'directory';
    resource: Resource;
    existed: boolean;
}

export interface Query {
    hash?: string;
    url?: string | string[];
    ino?: number;
}

export default class ResourceService extends Service {
    private resourceRegistry: ResourceRegistryEntry<any>[] = [];

    private hashOrUrlOrInoOrFilePathToResource: Record<string, Resource> = {};

    constructor() {
        super();
        this.registerResourceType(RESOURCE_ENTRY_COMMON_MODPACK);
        this.registerResourceType(RESOURCE_ENTRY_FORGE);
        this.registerResourceType(RESOURCE_ENTRY_LITELOADER);
        this.registerResourceType(RESOURCE_ENTRY_FABRIC);
        this.registerResourceType(RESOURCE_ENTRY_SAVE);
        this.registerResourceType(RESOURCE_ENTRY_RESOURCE_PACK);
        this.registerResourceType(RESOURCE_ENTRY_MODPACK);
    }

    protected registerResourceType(entry: ResourceRegistryEntry<any>) {
        if (this.resourceRegistry.find(r => r.type === entry.type)) {
            throw new Error(`The entry type ${entry.type} existed!`);
        }
        this.resourceRegistry.push(entry);
    }

    protected normalizeResource(resource: string | Resource) {
        return (typeof resource === 'string' ? this.hashOrUrlOrInoOrFilePathToResource[resource] : resource) ?? UNKNOWN_RESOURCE;
    }

    /**
     * Query in memory resource by key.
     * The key can be `hash`, `url` or `ino` of the file.
     */
    getResourceByKey(key: string | number): Resource | undefined {
        return this.hashOrUrlOrInoOrFilePathToResource[key];
    }

    /**
     * Query resource in memory by the resource query 
     * @param query The resource query.
     */
    getResource(query: Query) {
        let res: Resource;
        if (query.hash) {
            res = this.hashOrUrlOrInoOrFilePathToResource[query.hash];
            if (res) return res;
        }
        if (query.url) {
            if (typeof query.url === 'string') {
                res = this.hashOrUrlOrInoOrFilePathToResource[query.url];
                if (res) return res;
            } else {
                for (let u of query.url) {
                    res = this.hashOrUrlOrInoOrFilePathToResource[u];
                    if (res) return res;
                }
            }
        }
        if (query.ino) {
            res = this.hashOrUrlOrInoOrFilePathToResource[query.ino];
            if (res) return res;
        }
        return UNKNOWN_RESOURCE;
    }

    async load() {
        const resources: Resource[] = [];
        await Promise.all(['mods', 'resourcepacks', 'saves', 'modpacks']
            .map(async (domain) => {
                const path = this.getPath(domain);
                const files = await readdirEnsured(path);
                for (const file of files.filter(f => f.endsWith('.json'))) {
                    const filePath = join(path, file);
                    const read: ResourceSchema = await this.getPersistence({ path: filePath, schema: ResourceSchema });
                    read.path = filePath.substring(0, filePath.length - '.json'.length) + read.ext;
                    resources.push(read);
                }
            }));
        this.commit('resources', resources);

        for (let resource of resources) {
            this.hashOrUrlOrInoOrFilePathToResource[resource.hash] = resource;
            for (let url of resource.source.uri) {
                this.hashOrUrlOrInoOrFilePathToResource[url] = resource;
            }
            if (resource.source.curseforge) {
                this.hashOrUrlOrInoOrFilePathToResource[getCurseforgeUrl(resource.source.curseforge.projectId, resource.source.curseforge.fileId)] = resource;
            }
            this.hashOrUrlOrInoOrFilePathToResource[resource.path] = resource;
            stat(resource.path).then(s => {
                this.hashOrUrlOrInoOrFilePathToResource[s.ino.toString()] = resource;
            }).catch((e) => {
                this.error(`Unable to load resource ino ${resource.path}`);
                this.error(e);
            });
        }
    }

    /**
     * Force refresh a resource
     * @param res 
     */
    async refreshResource(res: string | Resource) {
        let resource = this.normalizeResource(res);
        if (resource === UNKNOWN_RESOURCE) return;
        try {
            let builder = getBuilderFromResource(resource);

            let data = await readFile(resource.path);
            await this.updateBuilderMetadata(builder, data);
            await this.persistResource(builder, data);
            this.cacheResource(getResourceFromBuilder(builder));
        } catch (e) {
            this.error(e);
            this.uncacheResource(resource);
            await this.unpersistResource(resource);
            this.commit('resourceRemove', resource);
        }
    }

    /**
     * Touch a resource. If it's checksum not matched, it will re-import this resource.
     */
    async touchResource(res: string) {
        let resource = this.normalizeResource(res);
        if (resource === UNKNOWN_RESOURCE) {
            return;
        }
        try {
            let builder = getBuilderFromResource(resource);
            let data = await readFile(resource.path);
            builder.hash = sha1(data);

            if (builder.hash !== resource.hash) {
                await this.unpersistResource(resource);
                await this.persistResource(builder, data);

                this.cacheResource(getResourceFromBuilder(builder));
            }
        } catch (e) {
            this.uncacheResource(resource);
            await this.unpersistResource(resource);
            this.commit('resourceRemove', resource);

            this.error(e);
        }
    }

    /**
     * Remove a resource from the launcher
     * @param resource 
     */
    async removeResource(resource: string | Resource) {
        let resourceObject = this.normalizeResource(resource);
        if (resourceObject === UNKNOWN_RESOURCE) return;

        this.uncacheResource(resourceObject);
        this.commit('resourceRemove', resourceObject);
        this.unpersistResource(resourceObject);
    }

    /**
     * Rename resource, this majorly affect displayed name.
     */
    async renameResource(option: { resource: string | Resource; name: string }) {
        const resource = this.normalizeResource(option.resource);
        if (resource === UNKNOWN_RESOURCE) return;
        const builder = getBuilderFromResource(resource);
        builder.name = option.name;
        const result = getResourceFromBuilder(builder);
        const ext = extname(resource.path);
        const pure = resource.path.substring(0, resource.path.length - ext.length);
        await writeFile(`${pure}.json`, JSON.stringify(result));
        this.cacheResource(result);
    }

    /**
     * Import the resource into the launcher.
     * @returns The resource resolved. If the resource cannot be resolved, it will goes to unknown domain.
     */
    async importResource(option: ImportOption) {
        requireString(option.path);
        let task = this.resolveResourceTask(option);
        let { resource, imported } = await (option.background ? task.execute().wait() : this.submit(task).wait());
        if (imported) {
            this.log(`Import and cache newly added resource ${resource.path}`);
            this.cacheResource(resource);
        } else if (!option.background) {
            this.log(`Import existed resource ${resource.path}`);
        }
        return resource;
    }

    /**
     * Export the resources into target directory. This will simply copy the resource out.
     */
    async exportResource(payload: { resources: (string | Resource)[]; targetDirectory: string }) {
        const { resources, targetDirectory } = payload;

        const promises = [];
        for (const resource of resources) {
            let res: Resource<any> = this.normalizeResource(resource);
            if (res === UNKNOWN_RESOURCE) throw new Error(`Cannot find the resource ${resource}`);

            promises.push(copyPassively(res.path, join(targetDirectory, res.name + res.ext)));
        }
        await Promise.all(promises);
    }

    async parseFileAsResource(options: ParseFilesOptions): Promise<ParseFileResult[]> {
        const { files } = options;
        return Promise.all(files.map(async (file) => {
            const { path, hint } = file;
            let data: Buffer | undefined;
            let hash: string | undefined;
            let fileStat = await stat(path);
            if (fileStat.isDirectory()) {
                return { path, resource: UNKNOWN_RESOURCE, type: 'directory', existed: false } as ParseFileResult;
            }
            let resource: Resource | undefined;
            let ino = fileStat.ino;
            resource = this.getResourceByKey(ino);
            if (!resource) {
                data = await readFile(path);
                hash = sha1(data);
                resource = this.getResourceByKey(hash);
            }
            // resource existed
            if (resource) {
                return { type: resource.type, resource, path, fileType: resource.ext, existed: true } as ParseFileResult;
            }

            if (!data) {
                data = await readFile(path);
            }
            if (!hash) {
                hash = sha1(data);
            }
            const type: FileType | 'unknown' = fileType(data)?.ext ?? 'unknown';

            if (type === 'zip') {
                let builder = createResourceBuilder({});
                decorateBuilderWithPathAndHash(builder, path, hash);
                decorateBuilderFromStat(builder, fileStat);
                await this.updateBuilderMetadata(builder, data, hint);
                resource = getResourceFromBuilder(builder);
                return {
                    path,
                    type: resource.type,
                    fileType: type,
                    resource,
                    existed: false,
                } as ParseFileResult;
            }
            
            return {
                path,
                type: 'unknown',
                existed: false,
                fileType: type ?? extname(path),
                resource: UNKNOWN_RESOURCE,
            } as ParseFileResult;
        }));
    }

    // bridge from dry function to `this` context

    /**
    * Import the resource from the same disk. This will parse the file and import it into our db by hardlink.
    * 
    * The original file will not be modified.
    * 
    * @param path The path in the same disk
    * @param urls The urls
    * @param source The source metadata
    */
    async importResources(files: {
        filePath: string;
        url: string[];
        source?: {
            curseforge?: CurseforgeSource;
        };
    }[], typeHint?: string) {
        let resources = await Promise.all(files.map((f) => this.resolveResourceTask({ path: f.filePath, url: f.url, source: f.source, type: typeHint }).execute().wait()));
        this.log(`Import ${files.length} resources. Imported ${resources.filter(r => r.imported).length} new resources, and ${resources.filter(r => !r.imported).length} resources existed.`);
        this.cacheResources(resources.filter(r => r.imported).map(r => r.resource));
    }

    /**
     * Resolve resource task. This will not write the resource to the cache, but it will persist the resource to disk.  
     */
    resolveResourceTask(importOption: ImportOption) {
        const resolve = async (context: Task.Context) => {
            let { path, source = {}, url = [], type } = importOption;
            context.update(0, 4, path);

            let data: Buffer | undefined;
            let hash: string | undefined;
            let fileStat = await stat(path);
            if (fileStat.isDirectory()) {
                throw new Error(`Cannot import dictionary resource ${importOption.path}`);
            }
            let resource: Resource | undefined;
            let ino = fileStat.ino;
            resource = this.getResourceByKey(ino);
            if (!resource) {
                data = await readFile(path);
                hash = sha1(data);
                resource = this.getResourceByKey(hash);
            }
            // resource existed
            if (resource) {
                return { imported: false, resource };
            }

            if (!data) {
                data = await readFile(path);
            }
            if (!hash) {
                hash = sha1(data);
            }

            let builder = createResourceBuilder(source);
            context.update(1, 4, path);
            decorateBuilderWithPathAndHash(builder, path, hash);
            decorateBuilderSourceUrls(builder, url);
            decorateBuilderFromStat(builder, fileStat);

            // check the resource existence
            // use parser to parse metadata
            await this.updateBuilderMetadata(builder, data, type);
            context.update(2, 4, path);

            // write resource to disk
            await this.persistResource(builder, data);
            context.update(3, 4, path);

            resource = getResourceFromBuilder(builder);

            context.update(4, 4, path);
            return { imported: true, resource };
        };

        return task('importResource', resolve);
    }

    public cacheResources(resources: Resource[]) {
        for (let resource of resources) {
            this.hashOrUrlOrInoOrFilePathToResource[resource.hash] = resource;
            for (let url of resource.source.uri) {
                this.hashOrUrlOrInoOrFilePathToResource[url] = resource;
            }
            this.hashOrUrlOrInoOrFilePathToResource[resource.ino.toString()] = resource;
            this.hashOrUrlOrInoOrFilePathToResource[resource.path] = resource;
        }
        this.commit('resources', resources);
    }

    protected uncacheResource(resource: Resource) {
        delete this.hashOrUrlOrInoOrFilePathToResource[resource.hash];
        for (let url of resource.source.uri) {
            delete this.hashOrUrlOrInoOrFilePathToResource[url];
        }
        delete this.hashOrUrlOrInoOrFilePathToResource[resource.ino];
        delete this.hashOrUrlOrInoOrFilePathToResource[resource.path];
    }

    protected cacheResource(resource: Resource) {
        this.hashOrUrlOrInoOrFilePathToResource[resource.hash] = resource;
        for (let url of resource.source.uri) {
            this.hashOrUrlOrInoOrFilePathToResource[url] = resource;
        }
        this.hashOrUrlOrInoOrFilePathToResource[resource.ino] = resource;
        this.hashOrUrlOrInoOrFilePathToResource[resource.path] = resource;
        this.commit('resource', resource);
    }

    protected persistResource(builder: ResourceBuilder, resourceData: Buffer, resourcePath?: string) {
        return commitResourceOnDisk(builder, resourceData, this.getPath(), resourcePath);
    }

    protected unpersistResource(builder: ResourceBuilder) {
        return discardResourceOnDisk(builder, this.getPath());
    }

    protected async updateBuilderMetadata(builder: ResourceBuilder, resourceData: Buffer, type?: string) {
        type = type ?? builder.type;
        let resourceInfo = await parseResource(this.resourceRegistry, resourceData, builder.ext, type);
        decorateBuilderFromMetadata(builder, resourceInfo);
    }
}
