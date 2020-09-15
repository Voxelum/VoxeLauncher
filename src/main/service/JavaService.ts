import { missing, readdirIfPresent } from '@main/util/fs';
import { unpack7z } from '@main/util/zip';
import { MutationKeys } from '@universal/store';
import { JavaRecord } from '@universal/store/modules/java';
import { Java, JavaSchema } from '@universal/store/modules/java.schema';
import { requireString } from '@universal/util/assert';
import { downloadFileTask, JavaInstaller } from '@xmcl/installer';
import { task } from '@xmcl/task';
import { extract } from '@xmcl/unzip';
import { move, remove, unlink } from 'fs-extra';
import { join } from 'path';
import Service, { Singleton } from './Service';

export default class JavaService extends Service {
    private javaFile = this.app.platform.name === 'windows' ? 'javaw.exe' : 'java';

    getInternalJavaLocation() {
        return join(this.state.root, 'jre', 'bin', this.javaFile);
    }

    async load() {
        const loaded: JavaSchema = await this.getPersistence({ path: this.getPath('java.json'), schema: JavaSchema });
        const javas = loaded.all.filter(l => typeof l.path === 'string').map(a => ({ ...a, valid: true }));
        this.commit('javaUpdate', javas);
        this.log(`Loaded ${javas.length} java from cache.`);
        if (this.state.java.all.length === 0) {
            await this.refreshLocalJava();
        }
    }

    async init() {
        const { state } = this;
        let local = this.getInternalJavaLocation();
        if (!state.java.all.map(j => j.path).some(p => p === local)) {
            this.resolveJava(local);
        }
        this.refreshLocalJava();
    }

    async save({ mutation }: { mutation: MutationKeys }) {
        switch (mutation) {
            case 'javaUpdate':
            case 'javaRemove':
                this.setPersistence({ path: this.getPath('java.json'), data: this.state.java, schema: JavaSchema });
                break;
            default:
        }
    }

    /**
     * Install a default jdk 8 to the a preserved location. It'll be installed under your launcher root location `jre` folder
     */
    @Singleton('java')
    async installDefaultJava() {
        let task = this.networkManager.isInGFW ? this.installFromTsingHuaTask() : this.installFromMojangTask();
        let handle = this.submit(task);
        await handle.wait();
        await this.resolveJava(this.getInternalJavaLocation());
    }

    private installFromMojangTask() {
        let dest = this.getInternalJavaLocation();
        return JavaInstaller.installJreFromMojangTask({
            destination: dest,
            unpackLZMA: unpack7z,
            ...this.networkManager.getDownloaderOption(),
        });
    }

    private installFromTsingHuaTask() {
        return task('installJre', async (c) => {
            let system = this.app.platform.name === 'osx' ? 'mac' as const : this.app.platform.name;
            let arch = this.app.platform.arch === 'x64' ? '64' as const : '32' as const;
            let list = (await this.networkManager.request.get('https://mirrors.tuna.tsinghua.edu.cn/AdoptOpenJDK/8/filelist').text())
                .split('\n')
                .map(l => l.split('/').slice(5));
            const zipFile = list
                .find(l => l[0] === 'jre' && l[1] === `x${arch}` && l[2] === system && (l[3].endsWith('.zip') || l[3].endsWith('.tar.gz')));
            if (!zipFile) {
                throw new Error(`Cannot find jre for ${system} x${arch}`);
            }
            let sha256File = list.find(l => l[3] === `${zipFile[3]}.sha256.txt`);
            let url = `https://mirrors.tuna.tsinghua.edu.cn/AdoptOpenJDK/8/${zipFile.join('/')}`;
            let sha256Url = `https://mirrors.tuna.tsinghua.edu.cn/AdoptOpenJDK/8/${sha256File?.join('/')}`;
            let sha256 = await this.networkManager.request(sha256Url).text().then((s) => s.split(' ')[0]).catch(e => '');
            let dest = join(this.state.root, 'jre');
            let tempZip = join(this.state.root, 'temp', 'java-temp');
            let checksum = sha256 ? {
                algorithm: 'sha256',
                hash: sha256,
            } : undefined;

            this.log(`Install jre for ${system} x${arch} from tsing hua mirror ${url}`);
            await c.execute(task('download', downloadFileTask({
                destination: tempZip,
                url,
                checksum,
            }, this.networkManager.getDownloaderOption())), 90);

            await c.execute(task('decompress', async () => {
                if (system === 'windows') {
                    await extract(tempZip, dest, {
                        entryHandler(_, e) {
                            return e.fileName.substring('jdk8u242-b08-jre'.length);
                        },
                    });
                } else {
                    let tempTar = join(this.state.root, 'temp', 'java-temp.tar');
                    await unpack7z(tempZip, tempTar);
                    await unpack7z(tempTar, join(this.state.root, 'temp'));
                    await move(join(this.state.root, 'temp', 'jdk8u242-b08-jre'), dest);
                    await remove(join(this.state.root, 'temp', 'jdk8u242-b08-jre'));
                    await unlink(tempTar);
                }
                await unlink(tempZip);
            }), 10);
            this.log('Install jre for from tsing hua mirror success!');
        });
    }

    /**
     * Resolve java info. If the java is not known by launcher. It will cache it into the launcher java list.
     */
    async resolveJava(javaPath: string): Promise<undefined | Java> {
        requireString(javaPath);

        let found = this.state.java.all.find(java => java.path === javaPath);
        if (found) {
            return found;
        }

        if (await missing(javaPath)) return undefined;

        let java = await JavaInstaller.resolveJava(javaPath);
        if (java) {
            this.commit('javaUpdate', { ...java, valid: true });
        }
        return java;
    }

    /**
     * scan local java locations and cache
     */
    @Singleton('java')
    async refreshLocalJava() {
        if (this.state.java.all.length === 0) {
            this.log('No local cache found. Scan java through the disk.');
            let commonLocations = [] as string[];
            if (this.app.platform.name === 'windows') {
                let files = await readdirIfPresent('C:\\Program Files\\Java');
                files = files.map(f => join('C:\\Program Files\\Java', f, 'bin', 'java.exe'));
                commonLocations.push(...files);
            }
            let javas = await JavaInstaller.scanLocalJava(commonLocations);
            let infos = javas.map(j => ({ ...j, valid: true }));
            this.log(`Found ${infos.length} java.`);
            this.commit('javaUpdate', infos);
        } else {
            this.log(`Re-validate cached ${this.state.java.all.length} java locations.`);
            let javas: JavaRecord[] = [];
            for (let i = 0; i < this.state.java.all.length; ++i) {
                let result = await JavaInstaller.resolveJava(this.state.java.all[i].path);
                if (result) {
                    javas.push({ ...result, valid: true });
                } else {
                    javas.push({ ...this.state.java.all[i], valid: false });
                }
            }
            let invalided = javas.filter(j => !j.valid).length;
            if (invalided !== 0) {
                this.log(`Invalidate ${invalided} java!`);
                for (let i of javas.filter(j => !j.valid)) {
                    this.log(i.path);
                }
            }
            this.commit('javaUpdate', javas);
        }
    }
}
