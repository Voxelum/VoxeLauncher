import LauncherApp from '@main/app/LauncherApp';
import { LauncherAppController } from '@main/app/LauncherAppController';
import { IS_DEV } from '@main/constant';
import { isDirectory } from '@main/util/fs';
import { UpdateInfo } from '@universal/entities/update';
import { StaticStore } from '@universal/util/staticStore';
import { Task } from '@xmcl/task';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { createServer } from 'http';
import { join } from 'path';
import { parse } from 'url';
import Controller from './Controller';
import { checkUpdateTask as _checkUpdateTask, DownloadAsarUpdateTask, DownloadFullUpdateTask, quitAndInstallAsar, quitAndInstallFullUpdate } from './updater';

export default class ElectronLauncherApp extends LauncherApp {
    createController(): LauncherAppController {
        return new Controller(this);
    }

    get version() { return app.getVersion(); }

    /**
     * A map to keep running browser
     */
    protected windows: { [name: string]: BrowserWindow } = {};

    showItemInFolder = shell.showItemInFolder;

    quitApp = app.quit;

    exit = app.exit;

    getPath(key: 'home' | 'appData' | 'userData' | 'cache' | 'temp' | 'exe' | 'module' | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | 'logs' | 'pepperFlashSystemPlugin') {
        return app.getPath(key);
    }

    handle = ipcMain.handle;

    /**
     * Push a event with payload to client.
     *
     * @param channel The event channel to client
     * @param payload The event payload to client
     */
    broadcast(channel: string, ...payload: any[]): void {
        BrowserWindow.getAllWindows().forEach(w => {
            w.webContents.send(channel, ...payload);
        });
    }

    /**
     * A safe method that only open directory. If the `path` is a file, it won't execute it.
     * @param file The directory path
     */
    async openDirectory(path: string) {
        if (await isDirectory(path)) {
            return shell.openItem(path);
        }
        return false;
    }

    /**
     * Try to open a url in default browser. It will popup a message dialog to let user know.
     * If user does not trust the url, it won't open the site.
     * @param url The pending url
     */
    async openInBrowser(url: string) {
        // if ([...BUILTIN_TRUSTED_SITES, ...this.trustedSites].indexOf(url) === -1) {
        //     const result = await this.controller!.requestOpenExternalUrl(url);
        //     if (result) {
        //         this.trustedSites.push(url);
        //         shell.openExternal(url);
        //         return true;
        //     }
        // } else {
        shell.openExternal(url);
        return true;
        // }
        // return false;
    }

    checkUpdateTask(): Task<UpdateInfo> {
        return _checkUpdateTask.bind(this)();
    }

    downloadUpdateTask(): Task<void> {
        if (this.storeManager.store.state.setting.updateInfo) {
            if (this.storeManager.store.state.setting.updateInfo.incremental) {
                const updatePath = join(this.appDataPath, 'update.asar');
                return new DownloadAsarUpdateTask(this.storeManager.store.state.setting.updateInfo, this.networkManager.isInGFW, updatePath)
                    .map(() => undefined);
            }
            return new DownloadFullUpdateTask();
        }
        throw new Error('Please check update first!');
    }

    async installUpdateAndQuit(): Promise<void> {
        if (this.storeManager.store.state.setting.updateInfo) {
            if (this.storeManager.store.state.setting.updateInfo.incremental) {
                await quitAndInstallAsar.bind(this)();
            } else {
                quitAndInstallFullUpdate();
            }
        } else {
            throw new Error('Please check and download update first!');
        }
    }

    waitEngineReady(): Promise<void> {
        return app.whenReady();
    }

    getModule(module: string) {
        if (module === 'electron') {
            return {};
        }
        return undefined;
    }

    relaunch() {
        app.relaunch();
    }

    protected async setup() {
        process.on('SIGINT', () => {
            app.quit();
        });

        if (!app.requestSingleInstanceLock()) {
            app.quit();
            return;
        }

        if (!app.isDefaultProtocolClient('xmcl')) {
            app.setAsDefaultProtocolClient('xmcl');
        }

        if (!IS_DEV && process.platform === 'win32') {
            if (process.argv.length > 1) {
                const urlOrPath = process.argv[process.argv.length - 1];
                if (!(urlOrPath.startsWith('https:') || urlOrPath.startsWith('http:')) && !await this.startFromUrl(urlOrPath).then(() => true, () => false)) {
                    this.startFromFilePath(urlOrPath).then(() => true, () => false);
                }
            }
        }

        if (IS_DEV) {
            const server = createServer((message, response) => {
                this.log(`Dev server recieve ${message.url}`);
                this.handleUrl(message.url!);
                response.statusCode = 200;
                response.end();
            });
            server.listen(3000, () => {
                this.log('Started development server!');
            });
        }

        // forward window-all-closed event
        app.on('window-all-closed', () => {
            this.emit('window-all-closed');
        });

        app.on('open-url', (event, url) => {
            event.preventDefault();
            this.handleUrl(url);
        }).on('second-instance', (e, argv) => {
            if (process.platform === 'win32') {
                const last = argv[argv.length - 1];
                if (last.startsWith('xmcl://')) {
                    this.handleUrl(last);
                }
                // Keep only command line / deep linked arguments
                // this.startFromFilePath(argv[argv.length - 1]);
            }
        });

        await super.setup();
    }

    getLocale() {
        return app.getLocale();
    }

    handleUrl(url: string) {
        const parsed = parse(url, true);
        if ((parsed.host === 'launcher' || IS_DEV) && parsed.pathname === '/auth') {
            let error: Error | undefined;
            if (parsed.query.error) {
                error = new Error(unescape(parsed.query.error_description as string));
                (error as any).error = parsed.query.error;
            }
            this.emit('microsoft-authorize-code', error, parsed.query.code as string);
        }
    }

    protected async onEngineReady() {
        app.allowRendererProcessReuse = true;
        return super.onEngineReady();
    }

    protected async onStoreReady(store: StaticStore<any>) {
        this.parking = true;

        store.subscribe(({ type, payload }) => {
            if (type === 'autoInstallOnAppQuit') {
                autoUpdater.autoInstallOnAppQuit = payload;
            } else if (type === 'allowPrerelease') {
                // autoUpdater.allowPrerelease = payload;
            } else if (type === 'autoDownload') {
                autoUpdater.autoDownload = payload;
            }
        });

        if (!store.state.setting.locale) {
            store.commit('locale', app.getLocale());
        }

        this.log(`Current launcher core version is ${this.version}.`);

        autoUpdater.autoInstallOnAppQuit = store.state.setting.autoInstallOnAppQuit;
        autoUpdater.autoDownload = store.state.setting.autoDownload;
        // autoUpdater.allowPrerelease = store.state.setting.allowPrerelease;

        autoUpdater.allowPrerelease = true;

        this.storeManager.store.commit('version', [app.getVersion(), process.env.BUILD_NUMBER]);

        await super.onStoreReady(store);
    }
}
