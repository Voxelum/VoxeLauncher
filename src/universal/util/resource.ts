import { LiteLoader, Fabric, Forge } from '@xmcl/mod-parser';
import { PackMeta } from '@xmcl/resourcepack';
import { ResourceSchema } from '@universal/store/modules/resource.schema';
import { CurseforgeModpackManifest } from '@main/service/CurseForgeService';
import { LevelDataFrame } from '@xmcl/world';

export function isForgeResource(resource: Resource): resource is ForgeResource {
    return resource.type === 'forge';
}

export function isFabricResource(resource: Resource): resource is FabricResource {
    return resource.type === 'fabric';
}

export function isResourcePackResource(resource: Resource): resource is ResourcePackResource {
    return resource.type === 'resourcepack';
}

export function isModResource(resource: Resource): resource is ForgeResource | FabricResource | LiteloaderResource {
    return resource.type === 'forge' || resource.type === 'fabric' || resource.type === 'liteloader';
}

export interface Resource<T = unknown> extends Omit<ResourceSchema, 'metadata'> {
    metadata: T;
    /**
     * The ino of the file on disk
     */
    ino: number;
    /**
     * The size of the resource
     */
    size: number;
    /**
     * The suggested ext of the resource
     */
    ext: string;
}
export type ForgeResource = Resource<Forge.ModMetaData[]> & { type: 'forge' };
export type FabricResource = Resource<Fabric.ModMetadata> & { type: 'fabric' };
export type LiteloaderResource = Resource<LiteLoader.MetaData> & { type: 'liteloader' };
export type ResourcePackResource = Resource<PackMeta.Pack> & { type: 'resourcepack' };
export type CurseforgeModpackResource = Resource<CurseforgeModpackManifest> & { type: 'curseforge-modpack' };
export type SaveResource = Resource<LevelDataFrame> & { type: 'save' };
export type UnknownResource = Resource<unknown> & { type: 'unknown' };

export const UNKNOWN_RESOURCE: UnknownResource = Object.freeze({
    metadata: {},
    type: 'unknown',
    domain: 'unknown',
    ino: 0,
    size: 0,
    hash: '',
    ext: '',
    path: '',
    tags: [],
    name: '',
    source: {
        uri: [],
        date: new Date('2000').toJSON(),
    },
});
