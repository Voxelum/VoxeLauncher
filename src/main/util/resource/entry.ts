import { Fabric, Forge, LiteLoader } from '@xmcl/mod-parser';
import { deserialize } from '@xmcl/nbt';
import { PackMeta, readIcon, readPackMeta } from '@xmcl/resourcepack';
import { LevelDataFrame } from '@xmcl/world';
import type { CurseforgeModpackManifest } from '@main/service/CurseForgeService';
import { ResourceRegistryEntry } from '.';
import { findLevelRoot } from '../save';
import { RuntimeVersions } from '@universal/store/modules/instance.schema';

export const RESOURCE_ENTRY_FORGE: ResourceRegistryEntry<Forge.ModMetaData[]> = ({
    type: 'forge',
    domain: 'mods',
    ext: '.jar',
    parseIcon: async (meta, fs) => {
        if (!meta[0] || !meta[0].logoFile) { return undefined; }
        return fs.readFile(meta[0].logoFile);
    },
    parseMetadata: fs => Forge.readModMetaData(fs),
    getSuggestedName: (meta) => {
        let name = '';
        if (meta && meta.length > 0) {
            let metadata = meta[0];
            if (typeof metadata.name === 'string' || typeof metadata.modid === 'string') {
                name += (metadata.name || metadata.modid);
                if (typeof metadata.mcversion === 'string') {
                    name += `-${metadata.mcversion}`;
                }
                if (typeof metadata.version === 'string') {
                    name += `-${metadata.version}`;
                }
            }
        }
        return name;
    },
    getUri: meta => (meta[0] ? `forge://${meta[0].modid}/${meta[0].version}` : ''),
});
export const RESOURCE_ENTRY_LITELOADER: ResourceRegistryEntry<LiteLoader.MetaData> = ({
    type: 'liteloader',
    domain: 'mods',
    ext: '.litemod',
    parseIcon: async () => undefined,
    parseMetadata: fs => LiteLoader.readModMetaData(fs),
    getSuggestedName: (meta) => {
        let name = '';
        if (typeof meta.name === 'string') {
            name += meta.name;
        }
        if (typeof meta.mcversion === 'string') {
            name += `-${meta.mcversion}`;
        }
        if (typeof meta.version === 'string') {
            name += `-${meta.version}`;
        }
        if (typeof meta.revision === 'string' || typeof meta.revision === 'number') {
            name += `-${meta.revision}`;
        }
        return name;
    },
    getUri: meta => `liteloader://${meta.name}/${meta.version}`,
});
export const RESOURCE_ENTRY_FABRIC: ResourceRegistryEntry<Fabric.ModMetadata> = ({
    type: 'fabric',
    domain: 'mods',
    ext: '.jar',
    parseIcon: async (meta, fs) => {
        if (meta.icon) {
            return fs.readFile(meta.icon);
        }
        return Promise.resolve(undefined);
    },
    parseMetadata: async fs => Fabric.readModMetaData(fs),
    getSuggestedName: (meta) => {
        let name = '';
        if (typeof meta.name === 'string') {
            name += meta.name;
        } else if (typeof meta.id === 'string') {
            name += meta.id;
        }
        if (typeof meta.version === 'string') {
            name += `-${meta.version}`;
        } else {
            name += '-0.0.0';
        }
        return name;
    },
    getUri: meta => `fabric://${meta.id}/${meta.version}`,
});
export const RESOURCE_ENTRY_RESOURCE_PACK: ResourceRegistryEntry<PackMeta.Pack> = ({
    type: 'resourcepack',
    domain: 'resourcepacks',
    ext: '.zip',
    parseIcon: async (meta, fs) => readIcon(fs),
    parseMetadata: fs => readPackMeta(fs),
    getSuggestedName: () => '',
    getUri: (_, hash) => `resourcepack://${hash}`,
});
export const RESOURCE_ENTRY_SAVE: ResourceRegistryEntry<LevelDataFrame> = ({
    type: 'save',
    domain: 'saves',
    ext: '.zip',
    parseIcon: async (meta, fs) => fs.readFile('icon.png'),
    parseMetadata: async fs => {
        let root = await findLevelRoot(fs, '');
        if (!root) throw new Error();
        return deserialize(await fs.readFile(`${root}level.dat`));
    },
    getSuggestedName: meta => meta.LevelName,
    getUri: (_, hash) => `save://${hash}`,
});
export const RESOURCE_ENTRY_MODPACK: ResourceRegistryEntry<CurseforgeModpackManifest> = ({
    type: 'curseforge-modpack',
    domain: 'modpacks',
    ext: '.zip',
    parseIcon: () => Promise.resolve(undefined),
    parseMetadata: fs => fs.readFile('manifest.json', 'utf-8').then(JSON.parse),
    getSuggestedName: () => '',
    getUri: (_, hash) => `modpack://${hash}`,
});
export const RESOURCE_ENTRY_COMMON_MODPACK: ResourceRegistryEntry<{ root: string; runtime: RuntimeVersions }> = ({
    type: 'modpack',
    domain: 'modpacks',
    ext: '.zip',
    parseIcon: () => Promise.resolve(undefined),
    parseMetadata: async (fs) => {
        if (await fs.isDirectory('./versions')
            && await fs.isDirectory('./mods')) {
            
            return { root: '', runtime:  };
        }
        if (await fs.isDirectory('.minecraft')) {
            return { root: '.minecraft' };
        }
        const files = await fs.listFiles('');
        for (const file of files) {
            if (await fs.isDirectory(file)) {
                if (await fs.isDirectory(fs.join(file, 'versions'))
                    && await fs.isDirectory(fs.join(file, 'mods'))) {
                    return { root: file };
                }
                if (await fs.isDirectory(fs.join(file, '.minecraft'))) {
                    return { root: fs.join(file, '.minecraft') };
                }
            }
        }
        throw new Error();
    },
    getSuggestedName: () => '',
    getUri: (_, hash) => `modpack://${hash}`,
});
