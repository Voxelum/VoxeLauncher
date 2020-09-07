import { ImportTypeHint } from '@universal/store/modules/resource';
import { FileSystem, openFileSystem } from '@xmcl/system';
import { ResourceRegistryEntry, UNKNOWN_ENTRY } from '.';


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
