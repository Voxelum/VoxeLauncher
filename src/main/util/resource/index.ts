import { FileSystem } from '@xmcl/system';
import { UrlWithStringQuery } from 'url';
import { Resource } from '@universal/util/resource';
import { Source } from '@universal/store/modules/resource.schema';

export * from './decorate';
export * from './entry';
export * from './io';
export * from './parse';
export * from '@universal/util/resource';

export interface ResourceRegistryEntry<T> {
    type: string;
    domain: string;
    ext: string;
    parseIcon: (metadata: T, data: FileSystem) => Promise<Uint8Array | undefined>;
    parseMetadata: (data: FileSystem) => Promise<T>;
    getSuggestedName: (metadata: T) => string;
    /**
     * Get ideal uri for this resource
     */
    getUri: (metadata: T, hash: string) => string;
}

export type SourceInfomation = Omit<Source, 'uri' | 'date'>;

export interface ResourceHost {
    /**
     * Query the resource by uri.
     * Throw error if not found.
     * @param uri The uri for the querying resource
     */
    query(uri: UrlWithStringQuery): Promise<{
        /**
         * The resource url
         */
        url: string;
        source: SourceInfomation;
        type: string;
    } | undefined>;
}

export const UNKNOWN_ENTRY: ResourceRegistryEntry<unknown> = {
    type: 'unknown',
    domain: 'unknowns',
    ext: '*',
    parseIcon: () => Promise.resolve(undefined),
    parseMetadata: () => Promise.resolve({}),
    getSuggestedName: () => '',
    getUri: () => '',
};

export interface ResourceBuilder extends Resource {
    icon?: Uint8Array;
}

/**
 * Create a resource builder from source.
 */
export function createResourceBuilder(source?: SourceInfomation): ResourceBuilder {
    source = source ?? {};
    return {
        name: '',
        path: '',
        hash: '',
        ext: '',
        domain: '',
        type: '',
        metadata: {},
        ino: 0,
        tags: [],
        size: 0,
        source: {
            uri: [],
            date: new Date().toJSON(),
            ...source,
        },
    };
}

export function getResourceFromBuilder(builder: ResourceBuilder): Resource {
    const res = { ...builder };
    delete res.icon;
    return res;
}

export function getBuilderFromResource(resource: Resource): ResourceBuilder {
    return { ...resource };
}

export function getCurseforgeUrl(project: number, file: number): string {
    return `curseforge://id/${project}/${file}`;
}

export function getCurseforgeSourceInfo(project: number, file: number): SourceInfomation {
    return {
        curseforge: {
            projectId: project,
            fileId: file,
        },
    };
}

export class ResourceCache {
    private cache: Record<string, Resource> = {};

    put(resource: Resource) {
        this.cache[resource.hash] = resource;
        for (let url of resource.source.uri) {
            this.cache[url] = resource;
        }
        this.cache[resource.ino] = resource;
        this.cache[resource.path] = resource;
    }

    discard(resource: Resource) {
        delete this.cache[resource.hash];
        for (let url of resource.source.uri) {
            delete this.cache[url];
        }
        delete this.cache[resource.ino];
        delete this.cache[resource.path];
    }

    get(key: string | number) {
        return this.cache[key];
    }
}
