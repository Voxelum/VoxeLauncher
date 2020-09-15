import { exists, missing, readdirEnsured } from '@main/util/fs';
import { createTemplate } from '@universal/store/modules/instance';
import { InstanceSchema, InstancesSchema, RuntimeVersions } from '@universal/store/modules/instance.schema';
import { requireObject, requireString } from '@universal/util/assert';
import latestRelease from '@universal/util/lasteRelease.json';
import { assignShallow } from '@universal/util/object';
import { getHostAndPortFromIp, PINGING_STATUS } from '@universal/util/serverStatus';
import { queryStatus, Status } from '@xmcl/client';
import { readInfo, ServerInfo } from '@xmcl/server-info';
import { ensureDir, readdir, readFile, remove } from 'fs-extra';
import { join, resolve } from 'path';
import { v4 } from 'uuid';
import ServerStatusService from './ServerStatusService';
import Service, { Inject, MutationTrigger, Singleton } from './Service';

const INSTANCES_FOLDER = 'instances';
const INSTANCE_JSON = 'instance.json';
const INSTANCES_JSON = 'instances.json';

export type CreateOption = DeepPartial<Omit<InstanceSchema, 'id' | 'lastAccessDate' | 'creationDate'> & { path: string }>;

export interface EditInstanceOptions extends Partial<Omit<InstanceSchema, 'deployments' | 'runtime' | 'server'>> {
    deployments?: Record<string, string[]>;

    runtime?: Partial<RuntimeVersions>;

    /**
     * If this is undefined, it will disable the server of this instance
     */
    server?: {
        /**
         * The host of the server (ip)
         */
        host: string;
        /**
         * The port of the server
         */
        port?: number;
    } | null;
    /**
     * The target instance path. If this is absent, it will use the selected instance.
     */
    instancePath?: string;
}

/**
 * Provide instance spliting service. It can split the game into multiple environment and dynamiclly deploy the resource to run.
 */
export class InstanceService extends Service {
    @Inject('ServerStatusService')
    protected readonly statusService!: ServerStatusService;

    protected getPathUnder(...ps: string[]) {
        return this.getPath(INSTANCES_FOLDER, ...ps);
    }

    @Singleton()
    async loadInstanceServerData(path: string) {
        requireString(path);

        let { commit } = this;
        try {
            let serversPath = join(path, 'servers.dat');
            if (await exists(serversPath)) {
                let serverDat = await readFile(serversPath);
                let infos = await readInfo(serverDat);
                this.log('Loaded server infos.');
                commit('instanceServerInfos', infos);
            }
            this.log('No server data found in instance.');
        } catch (e) {
            this.warn(`An error occured during loading server infos of ${path}`);
            this.error(e);
        }
    }

    async loadInstance(path: string) {
        requireString(path);

        let { commit, getters } = this;

        let jsonPath = join(path, INSTANCE_JSON);
        if (await missing(jsonPath)) {
            this.warn(`Cannot load instance ${path}`);
            return false;
        }

        let option: InstanceSchema;
        try {
            option = await this.getPersistence({ path: jsonPath, schema: InstanceSchema });
        } catch (e) {
            this.warn(`Cannot load instance json ${path}`);
            return false;
        }

        let instance = createTemplate();

        instance.path = path;
        instance.author = instance.author || getters.gameProfile?.name || '';
        instance.runtime.minecraft = latestRelease.id;

        assignShallow(instance, option);
        if (option.runtime) {
            assignShallow(instance.runtime, option.runtime);
        }
        if (option.resolution) {
            if (instance.resolution) {
                assignShallow(instance.resolution, option.resolution);
            } else {
                instance.resolution = option.resolution;
            }
        }
        instance.server = option.server;

        commit('instanceAdd', instance);

        this.log(`Added instance ${instance.path}`);

        return true;
    }

    async init() {
        let { getters } = this;
        let instances = getters.instances;
        if (instances.length === 0) {
            this.log('Cannot find any instances, try to init one default modpack.');
            await this.createAndMount({});
        }
    }

    async load() {
        const uuidExp = /([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}){1}/;

        let { state } = this;
        let [managed, instanceConfig] = await Promise.all([
            readdirEnsured(this.getPathUnder()),
            this.getPersistence({ path: this.getPath(INSTANCES_JSON), schema: InstancesSchema }),
        ]);
        managed = managed.map(p => this.getPathUnder(p)).filter(f => uuidExp.test(f));

        this.log(`Found ${managed.length} managed instances and ${instanceConfig.instances.length} external instances.`);

        let all = [...new Set([...instanceConfig.instances, ...managed])];

        if (all.length === 0) {
            return;
        }

        await Promise.all(all.map(path => this.loadInstance(path)));

        if (Object.keys(state.instance.all).length === 0) {
            return;
        }

        if (this.state.instance.all[instanceConfig.selectedInstance]) {
            await this.mountInstance(instanceConfig.selectedInstance);
        } else {
            await this.mountInstance(Object.keys(state.instance.all)[0]);
        }
    }

    @MutationTrigger('instanceAdd')
    async saveNewInstance(payload: InstanceSchema & { path: string }) {
        await this.setPersistence({
            path: join(payload.path, INSTANCE_JSON),
            data: payload,
            schema: InstanceSchema,
        });
        await this.setPersistence({
            path: this.getPath(INSTANCES_JSON),
            data: { instances: Object.keys(this.state.instance.all), selectedInstance: this.state.instance.path },
            schema: InstancesSchema,
        });
        this.log(`Saved new instance ${payload.path}`);
    }

    @MutationTrigger('instanceRemove')
    async saveInstanceRemoved() {
        await this.setPersistence({
            path: this.getPath(INSTANCES_JSON),
            data: { instances: Object.keys(this.state.instance.all), selectedInstance: this.state.instance.path },
            schema: InstancesSchema,
        });
    }

    @MutationTrigger('instance')
    async saveInstance() {
        await this.setPersistence({
            path: join(this.state.instance.path, INSTANCE_JSON),
            data: this.state.instance.all[this.state.instance.path],
            schema: InstanceSchema,
        });
        this.log(`Saved instance ${this.state.instance.path}`);
    }

    @MutationTrigger('instanceSelect')
    async saveInstanceSelect(path: string) {
        await Promise.all([this.setPersistence({
            path: this.getPath(INSTANCES_JSON),
            data: { selectedInstance: path, instances: Object.keys(this.state.instance.all) },
            schema: InstancesSchema,
        }), this.setPersistence({
            path: join(path, INSTANCE_JSON),
            data: this.state.instance.all[path],
            schema: InstanceSchema,
        })]);
        this.log(`Saved instance selection ${path}`);
    }

    /**
     * Return the instance's screenshots urls.
     * 
     * If the provided path is not a instance, it will return empty array.
     */
    async listInstanceScreenshots(path: string) {
        let screenshots = join(path, 'screenshots');
        try {
            let files = await readdir(screenshots);
            return files.map(f => `file://${screenshots}/${f}`);
        } catch (e) {
            return [];
        }
    }

    /**
     * Create a managed instance (either a modpack or a server) under the managed folder.
     * @param option The creation option
     * @returns The instance path
     */
    async createInstance(payload: CreateOption): Promise<string> {
        requireObject(payload);

        let instance = createTemplate();

        assignShallow(instance, payload);
        if (payload.runtime) {
            assignShallow(instance.runtime, payload.runtime);
        }
        if (payload.resolution) {
            if (instance.resolution) {
                assignShallow(instance.resolution, payload.resolution);
            } else {
                instance.resolution = payload.resolution;
            }
        }
        if (payload.server) {
            instance.server = payload.server;
        }

        instance.path = payload.path || this.getPathUnder(v4());
        instance.runtime.minecraft = instance.runtime.minecraft || this.getters.minecraftRelease.id;
        instance.author = this.getters.gameProfile?.name ?? '';
        instance.creationDate = Date.now();
        instance.lastAccessDate = Date.now();

        instance.author = payload.author ?? instance.author;
        instance.description = payload.description ?? instance.description;
        instance.showLog = payload.showLog ?? instance.showLog;

        await ensureDir(instance.path);
        this.commit('instanceAdd', instance);

        this.log('Created instance with option');
        this.log(JSON.stringify(instance, null, 4));

        return instance.path;
    }

    /**
     * Create a managed instance in storage.
     */
    async createAndMount(payload: CreateOption): Promise<string> {
        requireObject(payload);

        let path = await this.createInstance(payload);
        await this.mountInstance(path);
        return path;
    }

    /**
     * Mount the instance as the current active instance.
     * @param path the instance path
     */
    @Singleton()
    async mountInstance(path: string) {
        requireString(path);

        if (path === this.state.instance.path) { return; }

        let missed = await missing(path);
        if (missed) {
            this.log(`Cannot mount instance ${path}, either the directory not exist or the launcher has no permission.`);
            return;
        }

        this.log(`Try to mount instance ${path}`);

        // not await this to improve the performance

        this.commit('instanceSelect', path);
    }

    /**
     * Delete the managed instance from the disk
     * @param path The instance path
     */
    async deleteInstance(path = this.state.instance.path) {
        requireString(path);

        // if the instance is selected now
        if (this.state.instance.path === path) {
            let restPath = Object.keys(this.state.instance.all).filter(p => p !== path);
            // if only one instance left
            if (restPath.length === 0) {
                // then create and select a new one
                await this.createAndMount({});
            } else {
                // else select the first instance
                await this.mountInstance(restPath[0]);
            }
        }

        this.commit('instanceRemove', path);

        let managed = resolve(path).startsWith(resolve(this.getPathUnder()));
        let instanceDirectory = path;
        if (managed && await exists(instanceDirectory)) {
            await remove(instanceDirectory);
        }
    }

    /**
     * Edit the instance. If the `path` is not present, it will edit the current selected instance.
     * Otherwise, it will edit the instance on the provided path
     */
    async editInstance(options: EditInstanceOptions) {
        requireObject(options);

        let instancePath = options.instancePath || this.state.instance.path;
        let state = this.state.instance.all[instancePath];

        let ignored = { runtime: true, deployments: true, server: true, vmOptions: true, mcOptions: true, minMemory: true, maxMemory: true };
        let result: Record<string, any> = {};
        for (let key of Object.keys(options)) {
            if (key in ignored) {
                continue;
            }
            if (key in state) {
                if ((state as any)[key] !== (options as any)[key]) {
                    result[key] = (options as any)[key];
                }
            }
        }

        if ('maxMemory' in options) {
            if (typeof options.maxMemory === 'undefined') {
                result.maxMemory = 0;
            } else if (typeof options.maxMemory === 'number') {
                result.maxMemory = result.maxMemory > 0 ? options.maxMemory : 0;
            } else {
                throw new Error(`Invalid Argument: Expect maxMemory to be number or undefined! Got ${typeof options.maxMemory}.`);
            }
        }
        if ('minMemory' in options) {
            if (typeof options.minMemory === 'undefined') {
                result.minMemory = 0;
            } else if (typeof options.minMemory === 'number') {
                result.minMemory = result.minMemory > 0 ? options.minMemory : 0;
            } else {
                throw new Error(`Invalid Argument: Expect minMemory to be number or undefined! Got ${typeof options.maxMemory}.`);
            }
        }

        if ('runtime' in options && options.runtime) {
            let runtime = options.runtime;
            let currentRuntime = state.runtime;
            let resultRuntime: Partial<RuntimeVersions> = {};
            for (let version of Object.keys(runtime)) {
                if (version in currentRuntime) {
                    if (currentRuntime[version] !== runtime[version]) {
                        resultRuntime[version] = runtime[version];
                    }
                } else {
                    resultRuntime[version] = runtime[version];
                }
            }
            if (Object.keys(resultRuntime).length > 0) {
                result.runtime = resultRuntime;
            }
        }

        if ('server' in options) {
            if (options.server) {
                if (options.server.host !== state.server?.host || options.server.port !== state.server.port) {
                    result.server = options.server;
                }
            } else if (state.server !== undefined) {
                result.server = options.server;
            }
        }

        if ('vmOptions' in options && options.vmOptions) {
            let diff = options.vmOptions.length !== state.vmOptions.length || options.vmOptions.some((e, i) => e !== state.vmOptions[i]);
            if (diff) {
                result.vmOptions = options.vmOptions;
            }
        }

        if ('mcOptions' in options && options.mcOptions) {
            let diff = options.mcOptions.length !== state.mcOptions.length || options.mcOptions.some((e, i) => e !== state.mcOptions[i]);
            if (diff) {
                result.mcOptions = options.mcOptions;
            }
        }

        if (Object.keys(result).length > 0) {
            this.log(`Modify instance ${JSON.stringify(result, null, 4)}.`);
            this.commit('instance', { ...result, path: instancePath });
        }
    }

    /**
    * If current instance is a server. It will refresh the server status
    */
    @Singleton()
    async refreshServerStatus() {
        let prof = this.getters.instance;
        if (prof.server) {
            let { host, port } = prof.server;
            this.log(`Ping server ${host}:${port}`);
            this.commit('instanceStatus', PINGING_STATUS);
            let status = await this.statusService.pingServer({ host, port });
            this.commit('instanceStatus', status);
        }
    }

    /**
     * Refresh all instance server status if present
     */
    async refreshServerStatusAll() {
        let all = Object.values(this.state.instance.all).filter(p => !!p.server);
        let results = await Promise.all(all.map(async p => ({ [p.path]: await queryStatus(p.server!) })));
        this.commit('instancesStatus', results.reduce((a, b) => { Object.assign(a, b); return a; }, {}));
    }

    /**
     * Create a instance by server info and status.
     * This will try to ping the server and apply the mod list if it's a forge server.
     */
    createInstanceFromServer(info: ServerInfo & { status: Status }) {
        const options: Partial<InstanceSchema> = {};
        options.name = info.name;
        if (info.status) {
            // if (typeof info.status.description === 'string') {
            //     options.description = info.status.description;
            // } else if (typeof info.status.description === 'object') {
            //     options.description = TextComponent.from(info.status.description).formatted;
            // }
            options.runtime = {
                minecraft: this.state.client.protocolMapping.mcversion[info.status.version.protocol][0],
                forge: '',
                liteloader: '',
                fabricLoader: '',
                yarn: '',
            };
            if (info.status.modinfo && info.status.modinfo.type === 'FML') {
                // TODO: handle mod server
            }
        }
        return this.createInstance({
            ...options,
            server: getHostAndPortFromIp(info.ip),
        });
    }
}
// resourcePacks:["vanilla","file/§lDefault§r..§l3D§r..Low§0§o.zip"]

export default InstanceService;
