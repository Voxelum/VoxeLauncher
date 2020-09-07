import { getCurseforgeSourceInfo, UNKNOWN_RESOURCE } from '@main/util/resource';
import { TaskState } from '@universal/task';
import { requireObject, requireString } from '@universal/util/assert';
import { AddonInfo, File, getAddonDatabaseTimestamp, getAddonDescription, getAddonFiles, getAddonInfo, getCategories, getCategoryTimestamp, GetFeaturedAddonOptions, getFeaturedAddons, searchAddons, SearchOptions } from '@xmcl/curseforge';
import { task } from '@xmcl/task';
import { Agent } from 'https';
import { basename, join } from 'path';
import ResourceService from './ResourceService';
import Service, { Inject, Singleton } from './Service';

export type ProjectType = 'mc-mods' | 'texture-packs' | 'worlds' | 'modpacks';

/**
 * The modpack metadata structure
 */
export interface CurseforgeModpackManifest {
    manifestType: string;
    manifestVersion: number;
    minecraft: {
        version: string;
        libraries?: string;
        modLoaders: {
            id: string;
            primary: boolean;
        }[];
    };
    name: string;
    version: string;
    author: string;
    files: {
        projectID: number;
        fileID: number;
        required: boolean;
    }[];
    overrides: string;
}

export interface InstallFileOptions {
    file: File;
    projectId: number;
    type: ProjectType;
}

export default class CurseForgeService extends Service {
    @Inject('ResourceService')
    private resourceService!: ResourceService;

    private userAgent: Agent = new Agent({ keepAlive: true });

    private projectTimestamp = '';

    private projectCache: Record<number, AddonInfo> = {};

    private projectDescriptionCache: Record<number, string> = {};

    private projectFilesCache: Record<number, File[]> = {};

    private searchProjectCache: Record<string, AddonInfo[]> = {};

    private async fetchOrGetFromCache<K extends string | number, V>(cacheName: string, cache: Record<K, V>, key: K, query: () => Promise<V>) {
        let timestamp = await getAddonDatabaseTimestamp({ userAgent: this.userAgent });
        if (!cache[key] || new Date(timestamp) > new Date(this.projectTimestamp)) {
            let value = await query();
            this.projectTimestamp = timestamp;
            cache[key] = value;
            this.log(`Cache missed for ${key} in ${cacheName}`);
            return value;
        }
        this.log(`Cache hit for ${key} in ${cacheName}`);
        return cache[key];
    }

    @Singleton()
    async loadCategories() {
        let timestamp = await getCategoryTimestamp({ userAgent: this.userAgent });
        if (this.state.curseforge.categories.length === 0
            || new Date(timestamp) > new Date(this.state.curseforge.categoriesTimestamp)) {
            let cats = await getCategories({ userAgent: this.userAgent });
            cats = cats.filter((c) => c.rootGameCategoryId === null && c.gameId === 432);
            this.commit('curseforgeCategories', { categories: cats, timestamp });
        }
    }

    async fetchProject(projectId: number) {
        this.log(`Fetch project: ${projectId}`);
        return this.fetchOrGetFromCache('project', this.projectCache, projectId, () => getAddonInfo(projectId, { userAgent: this.userAgent }));
    }

    fetchProjectDescription(projectId: number) {
        this.log(`Fetch project description: ${projectId}`);
        return this.fetchOrGetFromCache('project description', this.projectDescriptionCache, projectId, () => getAddonDescription(projectId, { userAgent: this.userAgent }));
    }

    fetchProjectFiles(projectId: number) {
        this.log(`Fetch project files: ${projectId}`);
        return this.fetchOrGetFromCache('project files', this.projectFilesCache, projectId, () => getAddonFiles(projectId, { userAgent: this.userAgent }).then(files => files.sort((a, b) => new Date(b.fileDate) - new Date(a.fileDate))));
    }

    async searchProjects(searchOptions: SearchOptions) {
        this.log(`Search project: section=${searchOptions.sectionId}, category=${searchOptions.categoryId}, keyword=${searchOptions.searchFilter}`);
        const addons = await this.fetchOrGetFromCache('project search', this.searchProjectCache, JSON.stringify(searchOptions), () => searchAddons(searchOptions, { userAgent: this.userAgent }));
        for (let addon of addons) {
            this.projectCache[addon.id] = addon;
        }
        return addons;
    }

    fetchFeaturedProjects(getOptions: GetFeaturedAddonOptions) {
        return getFeaturedAddons(getOptions, { userAgent: this.userAgent });
    }

    async installFile({ file, type, projectId }: InstallFileOptions) {
        requireString(type);
        requireObject(file);
        const typeHints: Record<ProjectType, string> = {
            'mc-mods': 'mods',
            'texture-packs': 'resourcepack',
            worlds: 'save',
            modpacks: 'curseforge-modpack',
        };
        const urls = [file.downloadUrl, `curseforge://${projectId}/${file.id}`];
        this.log(`Try install file ${file.displayName}(${file.downloadUrl}) in type ${type}`);
        const resource = this.resourceService.getResource({ url: urls });
        if (resource !== UNKNOWN_RESOURCE) {
            this.log(`The curseforge file ${file.displayName}(${file.downloadUrl}) existed in cache!`);
            return resource.path;
        }
        try {
            const destination = join(this.app.temporaryPath, basename(file.downloadUrl));
            const handle = this.submit(task('importResource', async (c) => {
                c.update(0, 100);

                await c.execute(task('download', this.networkManager.downloadFileTask({
                    url: file.downloadUrl,
                    destination,
                })), 80);

                // TODO: add tag from addon info
                // let addonInf = await this.fetchProject(projectId);
                return c.execute(task('parsing', () => this.resourceService.importResource({
                    path: destination,
                    url: urls,
                    source: getCurseforgeSourceInfo(projectId, file.id),
                    type: typeHints[type],
                })), 20);
            }));

            this.commit('curseforgeDownloadFileStart', { fileId: file.id, taskId: (handle.root as TaskState).id });
            const result = await handle.wait();
            this.log(`Install curseforge file ${file.displayName}(${file.downloadUrl}) success!`);
            return result.path;
        } finally {
            this.commit('curseforgeDownloadFileEnd', file.id);
        }
    }
}
