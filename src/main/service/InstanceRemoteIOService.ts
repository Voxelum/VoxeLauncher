import { RemoteServerInstanceProfile } from '@universal/entities/remote';
import { NodeSSH } from 'node-ssh';
import { join } from 'path';
import Service from './Service';

export interface DeployToServerOverSSHOptions {
    remoteServer: RemoteServerInstanceProfile;
    /**
     * The src instance path to deploy
     */
    instancePath: string;

    files: string[];
}

export default class InstanceRemoteIOService extends Service {
    async readRemoteMods() {

    }

    async readRemotePlugins() {
        
    }

    async readRemoteDirectoryContent() {

    }

    async deployOverSSH(options: DeployToServerOverSSHOptions) {
        const { remoteServer, instancePath, files } = options;
        const { host, port, username, passphrase, password, privateKey, serverDirectory } = remoteServer;
        const client = new NodeSSH();
        await client.connect({
            host,
            port,
            username,
            passphrase,
            password,
            privateKey,
        });
        const fileTransfers = files.map((f) => ({ local: join(instancePath, f), remote: join(serverDirectory, f) }));
        await client.putFiles(fileTransfers);
    }
}
