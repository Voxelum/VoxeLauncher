import { FileSystem, openFileSystem } from '@xmcl/system';
import { ImportTypeHint } from '@main/service/ResourceService';
import { ResourceRegistryEntry, UNKNOWN_ENTRY } from '.';
import { extname, basename } from 'path';


export async function parseResource(resourceRegistry: ResourceRegistryEntry<any>[], data: Buffer, ext: string, typeHint?: ImportTypeHint) {
    let chains: Array<ResourceRegistryEntry<any>> = [];

    async function parseMetadataAndIcon(entry: ResourceRegistryEntry<any>, fs: FileSystem) {
        let metadata = await entry.parseMetadata(fs);
        let icon = await entry.parseIcon(metadata, fs).catch(() => undefined);
        return { metadata, icon };
    }

    try {
        let fs = await openFileSystem(data);

        let hint = typeHint || '';
        if (hint === '*' || hint === '') {
            chains = resourceRegistry.filter(r => r.ext === ext);
        } else {
            chains = resourceRegistry.filter(r => r.domain === hint || r.type === hint);
        }
        chains.push(UNKNOWN_ENTRY);

        return chains.map((reg) => async () => ({
            ...reg,
            ...await parseMetadataAndIcon(reg, fs),
        })).reduce((memo, b) => memo.catch(() => b()), Promise.reject<ResourceRegistryEntry<any> & { metadata: any; icon: Uint8Array | undefined }>());
    } catch (e) {
        return { ...UNKNOWN_ENTRY, metadata: undefined, icon: undefined };
    }
}

export interface ResolvedResource {
    metadata: unknown;
    icon?: Uint8Array;
    domain: string;
    type: string;
    suggestedName: string;
    uri: string;
}

export async function parseResourceByPath(resourceRegistry: ResourceRegistryEntry<any>[], path: string, typeHint?: ImportTypeHint): Promise<ResolvedResource> {
    let chains: Array<ResourceRegistryEntry<any>> = [];

    async function parseMetadataAndIcon(entry: ResourceRegistryEntry<any>, fs: FileSystem) {
        let metadata = await entry.parseMetadata(fs);
        let icon = await entry.parseIcon(metadata, fs).catch(() => undefined);
        return { metadata, icon };
    }

    const ext = extname(path);

    let result: ResourceRegistryEntry<any> & { metadata: any; icon?: Uint8Array };
    try {
        let fs = await openFileSystem(path);

        let hint = typeHint || '';
        if (hint === '*' || hint === '') {
            chains = resourceRegistry.filter(r => r.ext === ext);
        } else {
            chains = resourceRegistry.filter(r => r.domain === hint || r.type === hint);
        }
        chains.push(UNKNOWN_ENTRY);

        result = await chains.map((reg) => async () => ({
            ...reg,
            ...await parseMetadataAndIcon(reg, fs),
        })).reduce((memo, b) => memo.catch(() => b()), Promise.reject<ResourceRegistryEntry<any> & { metadata: any; icon: Uint8Array | undefined }>());
    } catch (e) {
        result = { ...UNKNOWN_ENTRY, metadata: undefined, icon: undefined };
    }

    return {
        domain: result.domain,
        type: result.type,
        metadata: result.metadata,
        icon: result.icon,
        suggestedName: result.getSuggestedName(result.metadata) || basename(path, ext),
        uri: result.getUri(result.metadata, ''),
    };
}
