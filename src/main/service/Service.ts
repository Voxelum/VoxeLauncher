import LauncherApp from '@main/app/LauncherApp';
import { Managers } from '@main/manager';
import LogManager from '@main/manager/LogManager';
import NetworkManager from '@main/manager/NetworkManager';
import ServiceManager from '@main/manager/ServiceManager';
import StoreManager from '@main/manager/StoreManager';
import TaskManager from '@main/manager/TaskManager';
import { MutationKeys, RootCommit, RootGetters, RootState } from '@universal/store';
import { Schema } from '@universal/store/Schema';
import { Exception, Exceptions } from '@universal/util/exception';
import { Task, TaskHandle } from '@xmcl/task';
import Ajv from 'ajv';
import { ensureFile, readFile, writeFile } from 'fs-extra';
import { createContext, runInContext } from 'vm';
import { join } from 'path';

export const INJECTIONS_SYMBOL = Symbol('__injections__');
export const MUTATION_LISTENERS_SYMBOL = Symbol('__listeners__');
export const PURE_SYMBOL = Symbol('__pure__');

export function Inject(type: string) {
    return function (target: any, propertyKey: string) {
        if (!Reflect.has(target, INJECTIONS_SYMBOL)) {
            Reflect.set(target, INJECTIONS_SYMBOL, []);
        }
        if (!type) {
            throw new Error(`Inject recieved type: ${type}!`);
        } else {
            Reflect.get(target, INJECTIONS_SYMBOL).push({ type, field: propertyKey });
        }
    };
}

/**
 * Fire on certain store mutation committed.
 * @param keys The mutations name
 */
export function MutationTrigger(...keys: MutationKeys[]) {
    return function (target: Service, propertyKey: string, descriptor: PropertyDescriptor) {
        if (!Reflect.has(target, MUTATION_LISTENERS_SYMBOL)) {
            Reflect.set(target, MUTATION_LISTENERS_SYMBOL, []);
        }
        if (!keys || keys.length === 0) {
            throw new Error('Must listen at least one mutation!');
        } else {
            Reflect.get(target, MUTATION_LISTENERS_SYMBOL).push(...keys.map(k => ({
                event: k,
                listener: descriptor.value,
            })));
        }
    };
}

export type KeySerializer = (this: Service, ...params: any[]) => string;

export enum Policy {
    Skip = 'skip',
    Wait = 'wait'
}

const runningSingleton: Record<string, Promise<any>> = {};

/**
 * A service method decorator to make sure this service call should run in singleton -- no second call at the time.
 * The later call will wait the first call end and return the first call result.
 */
export function Singleton(...keys: (string | KeySerializer)[]) {
    return function (target: Service, propertyKey: string, descriptor: PropertyDescriptor) {
        const method = descriptor.value;
        const func = function (this: Service, ...args: any[]) {
            const semiphores: string[] = [propertyKey, ...keys.map((k => (typeof k === 'string' ? k : k.bind(this)(...args))))];
            if (semiphores.some((key) => this.isBusy(key))) {
                return runningSingleton[semiphores[0]];
            }
            this.aquire(semiphores);
            let isPromise = false;
            try {
                const result = method.apply(this, args);
                if (result instanceof Promise) {
                    isPromise = true;
                    const promise = result.finally(() => {
                        for (const s of semiphores) {
                            delete runningSingleton[s];
                        }
                        this.release(semiphores);
                    });
                    for (const s of semiphores) {
                        runningSingleton[s] = promise;
                    }
                    return promise;
                }
                return result;
            } finally {
                if (!isPromise) {
                    this.release(semiphores);
                }
            }
        };
        descriptor.value = func;
    };
}

export function Pure() {
    return function (target: Service, propertyKey: string, descriptor: PropertyDescriptor) {
        let func = Reflect.get(target, propertyKey);
        Reflect.set(func, PURE_SYMBOL, true);
    };
}

export class ServiceException extends Error {
    constructor(readonly exception: Exceptions, message?: string) {
        super(message);
    }
}


class WaitingQueue {
    private queue: Array<[Promise<void>, () => void]> = [];

    async getAndWait(): Promise<void> {
        let last: Promise<void> | undefined = this.queue[this.queue.length - 1]?.[0];
        let r: () => void;
        let p = new Promise<void>((resolve) => {
            r = resolve;
        });
        // reserve your place in line
        this.queue.push([p, r!]);
        // wait last guy to finish
        await last;
    }

    release(): void {
        this.queue.shift()?.[1]();
    }

    isWaiting() {
        return this.queue.length > 0;
    }

    async wait() {
        await this.queue[this.queue.length - 1]?.[0];
    }
}

class WaitingQueues {
    queues: Record<string, WaitingQueue> = {};
}

/**
 * The base class of a service.
 * 
 * The service is a stateful object has life cycle. It will be created when the launcher program start, and destroied 
 */
export default class Service implements Managers {
    readonly name: string;

    constructor(readonly app: LauncherApp) {
        this.name = Object.getPrototypeOf(this).constructor.name;
    }

    get networkManager() { return this.app.networkManager; }

    get serviceManager() { return this.app.serviceManager; }

    get taskManager() { return this.app.taskManager; }

    get logManager() { return this.app.logManager; }

    get storeManager() { return this.app.storeManager; }

    /**
     * Submit a task into the task manager. 
     * 
     * The lifecycle of the service call will fit with the task life-cycle automatically.
     *  
     * @param task 
     */
    protected submit<T>(task: Task<T>): TaskHandle<T, Task.State> {
        return this.taskManager.submit(task);
    }

    /**
     * The managed state
     */
    get state(): RootState { return this.storeManager.store.state; }

    /**
     * The managed getter
     */
    get getters(): RootGetters { return this.storeManager.store.getters as any; }

    /**
     * The commit method
     */
    get commit(): RootCommit { return this.storeManager.store.commit; }

    /**
     * Return the path under the config root
     */
    protected getAppDataPath: (...args: string[]) => string = (args) => join(this.app.appDataPath, ...args);

    /**
     * Return the path under the temp root
     */
    protected getTempPath: (...args: string[]) => string = (args) => join(this.app.temporaryPath, ...args);

    /**
     * Return the path under game libraries/assets root
     */
    protected getPath: (...args: string[]) => string = (args) => join(this.app.gameDataPath, ...args);

    /**
     * Return the path under .minecraft folder
     */
    protected getMinecraftPath: (...args: string[]) => string = (args) => join(this.app.minecraftDataPath, ...args);

    /**
     * The path of .minecraft
     */
    protected get minecraftPath() { return this.app.minecraftDataPath; }

    async save(payload: { mutation: MutationKeys; payload: any }): Promise<void> { }

    async load(): Promise<void> { }

    async init(): Promise<void> { }

    async dispose(): Promise<void> { }

    protected log(m: any, ...a: any[]) {
        this.logManager.log(`[${this.name}] ${m}`, ...a);
    }

    protected error(m: any, ...a: any[]) {
        this.logManager.error(`[${this.name}] ${m}`, ...a);
    }

    protected warn(m: any, ...a: any[]) {
        this.logManager.warn(`[${this.name}] ${m}`, ...a);
    }

    protected isBusy(key: string) {
        return this.serviceManager.isBusy(key);
    }

    protected aquire(key: string | string[]) {
        this.serviceManager.aquire(key);
    }

    protected release(key: string | string[]) {
        this.serviceManager.release(key);
    }

    protected precondition(issue: string) {
        if (this.getters.isIssueActive(issue)) {
            throw new Exception({ type: 'issueBlocked', issues: [] });
        }
    }

    protected pushException(e: Exceptions) {
        this.app.broadcast('notification', e);
    }

    protected async setPersistence<T>({ path, data, schema }: { path: string; data: T; schema?: Schema<T> }) {
        const deepCopy = JSON.parse(JSON.stringify(data));
        if (schema) {
            const schemaObject = schema;
            const ajv = new Ajv({ useDefaults: true, removeAdditional: true });
            const validation = ajv.compile(schemaObject);
            const valid = validation(deepCopy);
            if (!valid) {
                const context = createContext({ object: deepCopy });
                if (validation.errors) {
                    let message = `Error to persist to the disk path "${path}" with datatype ${typeof data}:\n`;
                    validation.errors.forEach(e => {
                        message += `- ${e.keyword} error @[${e.dataPath}:${e.schemaPath}]: ${e.message}\n`;
                    });
                    const cmd = validation.errors.map(e => `delete object${e.dataPath};`);
                    this.log(message);
                    this.log(cmd.join('\n'));
                    runInContext(cmd.join('\n'), context);
                }
            }
        }
        await ensureFile(path);
        await writeFile(path, JSON.stringify(deepCopy, null, 4), { encoding: 'utf-8' });
    }

    protected async getPersistence<T>(option: { path: string; schema?: Schema<T> }): Promise<T> {
        const { path, schema } = option;
        const originalString = await readFile(path).then(b => b.toString(), () => '{}');
        let object;
        try {
            object = JSON.parse(originalString);
        } catch (e) {
            object = {};
        }
        if (object && schema) {
            const schemaObject = schema;
            const ajv = new Ajv({ useDefaults: true, removeAdditional: true });
            const validation = ajv.compile(schemaObject);
            const valid = validation(object);
            if (!valid) {
                // this.warn('Try to remove those invalid keys. This might cause problem.');
                // this.warn(originalString);
                const context = createContext({ object });
                if (validation.errors) {
                    // this.warn(`Found invalid config file on ${path}.`);
                    // validation.errors.forEach(e => this.warn(e));
                    const cmd = validation.errors.filter(e => e.dataPath).map(e => `delete object${e.dataPath};`);
                    if (cmd.length !== 0) {
                        // this.log(cmd.join('\n'));
                        runInContext(cmd.join('\n'), context);
                    }
                }
            }
        }

        return object;
    }
}
