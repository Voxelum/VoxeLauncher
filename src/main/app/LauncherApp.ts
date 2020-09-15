import LauncherAppController from '@main/app/LauncherAppController';
import { LAUNCHER_NAME } from '@main/constant';
import { BrowserWindow, BrowserWindowConstructorOptions, Client, Dialog, Dock, Menu, MenuItem, MenuItemConstructorOptions, Notification, NotificationConstructorOptions, Tray } from '@main/engineBridge';
import LogManager from '@main/manager/LogManager';
import NetworkManager from '@main/manager/NetworkManager';
import ServiceManager from '@main/manager/ServiceManager';
import StoreManager from '@main/manager/StoreManager';
import TaskManager from '@main/manager/TaskManager';
import TelemetryManager from '@main/manager/TelemetryManager';
import { GiteeReleaseFetcher, GithubReleaseFetcher, ReleaseFetcher } from '@main/util/release';
import { UpdateInfo } from '@universal/store/modules/setting';
import { StaticStore } from '@universal/util/staticStore';
import { getPlatform } from '@xmcl/core';
import { Task } from '@xmcl/task';
import { ensureDir, readFile, writeFile, readJson } from 'fs-extra';
import { EventEmitter } from 'keyv';
import { join, extname } from 'path';
import { parse } from 'url';
import { exists, isDirectory } from '@main/util/fs';

export interface Platform {
    /**
     * The system name of the platform. This name is majorly used for download.
     */
    name: 'osx' | 'linux' | 'windows' | 'unknown';
    /**
     * The version of the os. It should be the value of `os.release()`.
     */
    version: string;
    /**
     * The direct output of `os.arch()`. Should look like x86 or x64.
     */
    arch: 'x86' | 'x64' | string;
}

export interface AppContext {
    openWindow(name: string, url: string, browserWindow: BrowserWindowConstructorOptions): BrowserWindow;

    closeWindow(name: string): void;

    /**
     * Only for the app engine support dock
     */
    dock?: Dock;

    dialog?: Dialog;

    /**
     * Only for the app engine support tray
     */
    createTray?(image: string): Tray;

    buildMenuFromTemplate?(template: Array<(MenuItemConstructorOptions) | (MenuItem)>): Menu;

    createNotification?(options: NotificationConstructorOptions): Notification;
}

export interface AppManifest {
    type: 'github' | 'gitee' | ['github', 'gitee'];
    owner: string;
    repo: string;
}

export interface LauncherApp {
    on(channel: 'window-all-closed', listener: () => void): this;
    on(channel: 'store-ready', listener: () => void): this;
    on(channel: 'minecraft-window-ready', listener: () => void): this;
    on(channel: 'minecraft-start', listener: (launchOptions: { version: string; minecraft: string; forge: string; fabric: string }) => void): this;
    on(channel: 'minecraft-exit', listener: (exitStatus: { code: number; signal: string; crashReport: string; crashReportLocation: string; errorLog: string }) => void): this;
    on(channel: 'minecraft-stdout', listener: (out: string) => void): this;
    on(channel: 'minecraft-stderr', listener: (err: string) => void): this;

    emit(channel: 'window-all-closed'): boolean;
    emit(channel: 'store-ready'): boolean;
    emit(channel: 'minecraft-window-ready', ...args: any[]): boolean;
    emit(channel: 'minecraft-start', launchOptions: { version: string; minecraft: string; forge: string; fabric: string }): boolean;
    emit(channel: 'minecraft-exit', exitStatus: { code: number; signal: string; crashReport: string; crashReportLocation: string; errorLog: string }): boolean;
    emit(channel: 'minecraft-stdout', out: string): boolean;
    emit(channel: 'minecraft-stderr', err: string): boolean;
}

export abstract class LauncherApp extends EventEmitter {
    static app: LauncherApp;

    /**
     * Launcher %APPDATA%/xmcl path
     */
    readonly appDataPath: string;

    /**
     * Store Minecraft data
     */
    readonly gameDataPath: string;

    /**
     * The .minecraft folder in Windows or minecraft folder in linux/mac
     */
    readonly minecraftDataPath: string;

    /**
     * Path to temporary folder
     */
    readonly temporaryPath: string;

    /**
     * ref for if the game is launching and the launcher is paused
     */
    protected parking = false;

    protected trustedSites: string[] = [];

    protected controller: LauncherAppController;

    // properties

    readonly networkManager = new NetworkManager(this);

    readonly serviceManager = new ServiceManager(this);

    readonly storeManager = new StoreManager(this);

    readonly taskManager = new TaskManager(this);

    readonly logManager = new LogManager(this);

    readonly telemetryManager = new TelemetryManager(this);

    readonly platform: Platform = getPlatform();

    abstract readonly version: string;

    readonly build: number = Number.parseInt(process.env.BUILD_NUMBER ?? '0', 10);

    get isParking(): boolean { return this.parking; }

    protected managers = [this.logManager, this.networkManager, this.taskManager, this.storeManager, this.serviceManager, this.telemetryManager];

    constructor() {
        super();
        const appData = this.getPath('appData');
        this.appDataPath = join(appData, LAUNCHER_NAME);
        this.gameDataPath = '';
        this.minecraftDataPath = join(appData, this.platform.name === 'osx' ? 'minecraft' : '.minecraft');
        this.temporaryPath = '';
        this.controller = new LauncherAppController(this, this.getContext());
        LauncherApp.app = this;
    }

    abstract getLocale(): string;

    abstract getContext(): AppContext;

    /**
     * Broadcast a event with payload to client.
     *
     * @param channel The event channel to client
     * @param payload The event payload to client
     */
    abstract broadcast(channel: string, ...payload: any[]): void;

    /**
     * Handle a event from client
     * 
     * @param channel The  event channel to listen
     * @param handler The listener callback will be called during this event recieved
     */
    abstract handle(channel: string, handler: (event: { sender: Client }, ...args: any[]) => any): void;

    /**
     * A safe method that only open directory. If the `path` is a file, it won't execute it.
     * @param file The directory path
     */
    abstract openDirectory(path: string): Promise<boolean>;

    /**
     * Try to open a url in default browser. It will popup a message dialog to let user know.
     * If user does not trust the url, it won't open the site.
     * @param url The pending url
     */
    abstract openInBrowser(url: string): Promise<boolean>;

    /**
     * Show the item in folder
     * @param path The file path to show.
     */
    abstract showItemInFolder(path: string): void;

    /**
     * Quit the app gentally.
     */
    quit() {
        Promise.all(this.managers.map(m => m.beforeQuit()))
            .then(() => this.quitApp());
    }

    /**
     * Quit the app gentally.
     */
    protected abstract quitApp(): void;

    /**
     * Force exit the app with exit code
     */
    abstract exit(code?: number): void;

    /**
     * Get the system provided path
     */
    abstract getPath(key: string): string;

    /**
     * Wait the engine ready
     */
    abstract waitEngineReady(): Promise<void>;

    /**
     * Get module exposed to controller
     * @param key The module name
     */
    abstract getModule(key: string): any;

    /**
     * Check update for the x-minecraft-launcher-core
     */
    abstract checkUpdateTask(): Task<UpdateInfo>;

    /**
     * Download the update to the disk. You should first call `checkUpdate`
     */
    abstract downloadUpdateTask(): Task<void>;

    /**
     * Install update and quit the app.
     */
    abstract installUpdateAndQuit(): Promise<void>;

    abstract relaunch(): void;

    protected log = (message: any, ...options: any[]) => { this.logManager.log(`[App] ${message}`, ...options); }

    protected warn = (message: any, ...options: any[]) => { this.logManager.warn(`[App] ${message}`, ...options); }

    protected error = (message: any, ...options: any[]) => { this.logManager.error(`[App] ${message}`, ...options); }

    /**
     * Start an app from file path
     * @param path The path of json
     */
    protected async startFromFilePath(path: string) {
        const ext = extname(path);
        if (ext === '.xmclm') {
            const manifest: AppManifest = await readJson(path);
            await this.loadManifest(manifest);
        } else if (ext === '.xmclapp') {
            await this.bootApp(path);
        } else if (await isDirectory(path)) {
            await this.bootApp(path);
        }
    }

    /**
     * Launch app from url request
     * @param url 
     */
    protected async startFromUrl(url: string) {
        function parseUrl(url: string): AppManifest {
            let { host, path } = parse(url);
            if (!path) throw new SyntaxError();
            if (host === 'github.com') {
                let [owner, repo] = path.split('/');
                return { type: 'github' as const, owner, repo };
            }
            if (host === 'gitee.com') {
                let [owner, repo] = path.split('/');
                return { type: 'gitee' as const, owner, repo };
            }
            throw new SyntaxError();
        }

        this.log(`Handle url request ${url}`);
        return this.loadManifest(parseUrl(url));
    }

    protected async loadManifest(manifest: AppManifest) {
        let { owner, repo } = manifest;
        let asarPath = join(this.appDataPath, 'apps', `${owner}-${repo}.asar`);
        if (!await exists(asarPath)) {
            await this.downloadApp(manifest);
        }
        await this.bootApp(asarPath);
    }

    // phase code

    /**
     * Boot the app on the path
     * @param appRoot App root path
     */
    protected async bootApp(appRoot: string) {
        // let indexPath = join(asarPath, 'index.js');
        // let buf = await readFile(indexPath);

        // const coreModule = {
        //     getResource(path: string) {
        //         return readFile(join(asarPath, path));
        //     },
        // };

        // const script = new Script(buf.toString());
        // const context = {
        //     module: {
        //         exports: {
        //             default: undefined,
        //         },
        //     },
        //     require: (name: string) => {
        //         if (name === 'xmcl-launcher') {
        //             return coreModule;
        //         }
        //         return this.getModule(name);
        //     },
        //     console,
        // };

        // script.runInNewContext(context);
    }

    protected async downloadApp(manifest: AppManifest) {
        let { owner, repo } = manifest;
        let releaseFetcher: ReleaseFetcher;
        if (manifest.type === 'gitee') {
            releaseFetcher = new GiteeReleaseFetcher(owner, repo);
        } else {
            releaseFetcher = new GithubReleaseFetcher(owner, repo);
        }
        let latest = await releaseFetcher.getLatestRelease();

        let manifestPath = join(this.appDataPath, 'apps', `${owner}-${repo}.json`);
        let asarPath = join(this.appDataPath, 'apps', `${owner}-${repo}.asar`);

        let task = Task.create('downloadApp', this.networkManager.downloadFileTask({
            url: latest.downloadUrl,
            destination: asarPath,
        }));
        let handle = this.taskManager.submit(task);
        await handle.wait();
        await writeFile(manifestPath, JSON.stringify(manifest));
    }

    readonly storeReadyPromise = new Promise((resolve) => {
        this.on('store-ready', resolve);
    });

    // setup code

    async start(): Promise<void> {
        this.log(process.cwd());
        this.log(process.argv);
        await this.setup();
        await this.waitEngineReady();
        await this.onEngineReady();
        await this.storeReadyPromise;
        await this.onStoreReady(this.storeManager.store);
    }

    protected async setup() {
        this.trustedSites = [];
        await ensureDir(this.appDataPath);
        try {
            (this.gameDataPath as any) = await readFile(join(this.appDataPath, 'root')).then((b) => b.toString().trim());
        } catch (e) {
            if (e.code === 'ENOENT') {
                // first launch
                await this.waitEngineReady();
                (this.gameDataPath as any) = await this.controller.processFirstLaunch();
                await writeFile(join(this.appDataPath, 'root'), this.gameDataPath);
            } else {
                (this.gameDataPath as any) = this.appDataPath;
            }
        }

        try {
            await Promise.all([ensureDir(this.gameDataPath), ensureDir(this.temporaryPath)]);
        } catch {
            (this.gameDataPath as any) = this.appDataPath;
            await Promise.all([ensureDir(this.gameDataPath), ensureDir(this.temporaryPath)]);
        }
        (this.temporaryPath as any) = join(this.gameDataPath, 'temp');
        await Promise.all(this.managers.map(m => m.setup()));
    }

    async migrateRoot(newRoot: string) {
        (this.gameDataPath as any) = newRoot;
        await writeFile(join(this.appDataPath, 'root'), newRoot);
    }

    protected async onEngineReady() {
        this
            .on('window-all-closed', () => {
                if (this.parking) return;
                if (process.platform !== 'darwin') { this.quitApp(); }
            })
            .on('minecraft-start', () => { this.parking = true; })
            .on('minecraft-exit', () => { this.parking = false; });

        this.controller!.engineReady();

        await Promise.all(this.managers.map(m => m.engineReady()));
    }

    protected async onStoreReady(store: StaticStore<any>) {
        this.parking = true;
        await Promise.all(this.managers.map(m => m.storeReady(this.storeManager.store)));
        await this.controller!.dataReady(store);
        this.log('App booted');
        this.parking = false;
    }
}

export default LauncherApp;
