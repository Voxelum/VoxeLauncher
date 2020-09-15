import { Schema } from '../Schema';

/* eslint-disable import/export  */
/* eslint-disable @typescript-eslint/no-var-requires */

export interface CurseforgeSource {
    /**
     * The curseforge project id
     */
    projectId: number;
    /**
     * The file id
     */
    fileId: number;
}

export interface Source {
    /**
     * The source uris.
     * - For the forge mod, it will be the forge://<modid>/<version>
     * - For the liteloader mod, it will be the liteloader://<name>/<version>
     * - For the curseforge file, it will be the curseforge://<fileId>
     * 
     * If the source is remote resource, it might also contain the uri like https://host/paths
     * @default []
     */
    uri: string[];
    /**
     * The date of import
     * @default ""
     */
    date: string;
    /**
     * The github info for this source. If this is imported from github release, it will present.
     */
    github?: {
        owner: string;
        repo: string;
        release: string;
    };
    /**
     * The curseforge info for this source. If this is imported from curseforge, it will present.
     */
    curseforge?: CurseforgeSource;
}

export interface ResourceSchema {
    /**
     * The resource file path relative to the resource domain
     */
    path: string;
    /**
     * The name of the resource
     */
    name: string;
    /**
     * The sha1 of the resource
     */
    hash: string;
    /**
     * The resource type. Can be `forge`, `liteloader`, `resourcepack`, and etc.
     */
    type: string;
    /**
     * The custom tag on this resource
     * @default []
     */
    tags: string[];
    /**
     * The domain of the resource. This decide where (which folder) the resource go 
     */
    domain: string | 'mods' | 'resourcepacks' | 'modpacks' | 'saves';
    /**
     * The resource specific metadata read from the file
     */
    metadata: object | object[];
    /**
     * Where the resource imported from?
     */
    source: Source;
}

export const ResourceSchema: Schema<ResourceSchema> = require('./ResourceSchema.json');
