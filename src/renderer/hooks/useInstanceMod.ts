import { FabricResource, ForgeResource, isModResource, LiteloaderResource, ModResource, Resource, Resources } from '@universal/entities/resource';
import { isNonnull } from '@universal/util/assert';
import { computed } from '@vue/composition-api';
import { FabricModMetadata } from '@xmcl/mod-parser';
import { useService, useStore } from '.';
import { useBusy } from './useSemaphore';

/**
 * Contains some basic info of mod to display in UI.
 */
export interface ModItem {
    /**
     * Path on disk
     */
    path: string;
    /**
     * The mod id
     */
    id: string;
    /**
     * Mod display name
     */
    name: string;
    /**
     * Mod version
     */
    version: string;
    description: string;
    /**
     * Mod icon url
     */
    icon: string;

    tags: string[];

    dependencies: {
        minecraft: string;
        fabricLoader?: string;
        forge?: string;
    };

    hash: string;
    /**
     * The universal location of the mod
     */
    url: string;

    type: 'fabric' | 'forge' | 'liteloader' | 'unknown';

    enabled: boolean;

    subsequence: boolean;

    hide: boolean;

    curseforge?: {
        projectId: number;
        fileId: number;
    }
}

/**
 * Open read/write for current instance mods
 */
export function useInstanceMods() {
    const { state } = useStore();
    const { deploy, undeploy } = useService('InstanceResourceService');
    const loading = useBusy('mountModResources');

    function getUrl(resource: Resource) {
        return resource.uri.find(u => u.startsWith('http')) ?? '';
    }
    function getModItemFromModResource(resource: ForgeResource | FabricResource | LiteloaderResource | Resources): ModItem {
        const icon = `${state.root}/${resource.location}.png`;
        let modItem: ModItem = {
            path: 'filePath' in resource ? (resource as any).filePath : resource.path,
            id: '',
            name: resource.path,
            version: '',
            description: '',
            icon,
            type: 'forge',
            url: getUrl(resource),
            hash: resource.hash,
            tags: resource.tags,
            enabled: false,
            subsequence: false,
            hide: false,
            curseforge: resource.curseforge,
            dependencies: {
                minecraft: '',
            },
        };
        if (resource.type === 'forge') {
            const meta = resource.metadata;
            modItem.type = 'forge';
            modItem.id = meta.modid;
            modItem.name = meta.name;
            modItem.version = meta.version;
            modItem.description = meta.description;
            modItem.dependencies.minecraft = meta.acceptMinecraft;
            modItem.dependencies.forge = meta.acceptForge;
        } else if (resource.type === 'fabric') {
            modItem.type = 'fabric';
            modItem.id = resource.metadata.id;
            modItem.version = resource.metadata.version;
            modItem.name = resource.metadata.name ?? resource.metadata.id;
            modItem.description = resource.metadata.description ?? '';
            const fab = resource.metadata as FabricModMetadata;
            modItem.dependencies.minecraft = (fab.depends?.minecraft as string) ? `[${(fab.depends?.minecraft as string)}]` : '';
            modItem.dependencies.fabricLoader = fab.depends?.fabricloader as string ?? '';
        } else if (resource.type === 'liteloader') {
            modItem.type = 'liteloader';
            modItem.name = resource.metadata.name;
            modItem.version = resource.metadata.version ?? '';
            modItem.id = `${resource.metadata.name}`;
            modItem.description = modItem.description ?? '';
            if (resource.metadata.mcversion) {
                modItem.dependencies.minecraft = `[${resource.metadata.mcversion}]`;
            }
        } else {
            modItem.type = 'unknown';
            modItem.name = resource.location;
        }
        return modItem;
    }

    function getModItemFromResource(resource: Resource): ModItem {
        if (isModResource(resource)) {
            return getModItemFromModResource(resource);
        }
        return {
            path: resource.path,
            id: resource.hash,
            name: resource.path,
            version: '',
            description: '',
            icon: '',
            type: 'unknown',
            url: getUrl(resource),
            hash: resource.hash,
            tags: resource.tags,
            enabled: false,
            subsequence: false,
            hide: false,
            curseforge: resource.curseforge,
            dependencies: { minecraft: '[*]' },
        };
    }

    /**
     * Commit the change for current mods setting
     */
    async function commit(items: ModItem[]) {
        const mods = state.resource.domains.mods;
        const map = new Map<string, ModResource>();
        for (const mod of mods) {
            map.set(mod.hash, mod);
        }
        const enabled = items.filter(m => m.enabled).map((m) => map.get(m.hash)).filter(isNonnull);
        const disabled = items.filter(m => !m.enabled).map((m) => map.get(m.hash)).filter(isNonnull);

        await Promise.all([
            deploy({ resources: enabled }),
            undeploy(disabled),
        ]);
    }

    const items = computed(() => {
        const items = state.resource.domains.mods.map(getModItemFromResource);
        const hashs = new Set(state.instance.mods.map(m => m.hash));
        for (const item of items) {
            if (hashs.has(item.hash)) {
                item.enabled = true;
            }
        }
        return items;
    });

    return {
        items,
        commit,
        loading,
    };
}
