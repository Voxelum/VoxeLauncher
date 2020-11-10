import { ModResource } from './resource';

export interface RemoteServerProfile {
    /** Hostname or IP address of the server. */
    host: string;
    /** 
     * Port number of the server.
     * It will use 22 by default.
     */
    port?: number;
    /** Username for authentication. */
    username?: string;
    /** Password for password-based user authentication. */
    password?: string;
    /** Path to ssh-agent's UNIX socket for ssh-agent-based user authentication (or 'pageant' when using Pagent on Windows). */
    agent?: string;
    /** file path or string that contains a private key for either key-based or hostbased user authentication (OpenSSH format). */
    privateKey?: string;
    /** For an encrypted private key, this is the passphrase used to decrypt it. */
    passphrase?: string;
}

export interface RemoteServerInstanceProfile extends RemoteServerProfile {
    /**
     * The directory of the remote Minecraft server
     */
    serverDirectory: string;
}

export interface DeployInfo {
    /**
     * The Date.now time stamp of the deployment
     */
    timestampe: number;
    mods: ModResource[];
    /**
     * Minecraft version
     */
    version: string;
}
