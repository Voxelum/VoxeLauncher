import { pipeline } from '@main/util/fs';
import { createReadStream } from 'fs';
import { join } from 'path';
import { Client, ClientChannel, SFTPWrapper } from 'ssh2';
import { } from 'ssh2-streams';
import { promisify } from 'util';
import Service from './Service';

export interface DeployToServerOverSSHOptions {
    /** Hostname or IP address of the server. */
    host?: string;
    /** Port number of the server. */
    port?: number;
    /** Username for authentication. */
    username?: string;
    /** Password for password-based user authentication. */
    password?: string;
    /** Path to ssh-agent's UNIX socket for ssh-agent-based user authentication (or 'pageant' when using Pagent on Windows). */
    agent?: string;
    /** Buffer or string that contains a private key for either key-based or hostbased user authentication (OpenSSH format). */
    privateKey?: Buffer | string;
    /** For an encrypted private key, this is the passphrase used to decrypt it. */
    passphrase?: string;
    /**
     * The destination direction to upload
     */
    destinationDirectory: string;
    /**
     * The src instance path to deploy
     */
    instancePath: string;

    files: string[]
}


function streamToString(stream: ClientChannel) {
    return new Promise((resolve, reject) => {
        let result = '';
        stream.on('data', (data: any) => {
            result += data.toString();
        });
        stream.on('close', () => {
            resolve(result);
        });
    });
}

interface FileTranfer {
    from: string;
    to: string;
}

function transferFilesOverSFTP(sftp: SFTPWrapper, filesTranfers: FileTranfer[]) {
    return Promise.all(filesTranfers.map(async (f) => {
        await new Promise((resolve, reject) => {
            sftp.fastPut(f.from, f.to, (e) => {
                if (e) reject(e);
                else resolve();
            });
        });
    }));
}

export default class InstanceRemoteIOService extends Service {
    async deployOverSSH(options: DeployToServerOverSSHOptions) {
        const { host, port, username, passphrase, password, privateKey, destinationDirectory, instancePath, files } = options;
        const client = new Client();
        const sftp = promisify(client.sftp.bind(client));
        await new Promise((resolve) => {
            client.on('ready', resolve).connect({
                host,
                port,
                username,
                passphrase,
                password,
                privateKey,
            });
        });
        const sftpClient = await sftp();

        const fileTransfers = files.map((f) => ({ from: join(instancePath, f), to: join(destinationDirectory, f) }));
        await transferFilesOverSFTP(sftpClient, fileTransfers);
    }
}
