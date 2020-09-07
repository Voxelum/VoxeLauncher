import { InstanceResource } from '@universal/store/modules/instance';
import { FabricResource, ForgeResource, isModResource, LiteloaderResource, Resource } from '@universal/util/resource';
import { computed } from '@vue/composition-api';
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

    acceptVersion: string;

    acceptLoaderVersion: string;

    hash: string;
    /**
     * The universal location of the mod
     */
    url: string;

    type: 'fabric' | 'forge' | 'liteloader' | 'unknown';

    enabled: boolean;

    resource: Resource;

    subsequence: boolean;

    hide: boolean;
}

/**
 * Open read/write for current instance mods
 */
export function useInstanceMods() {
    const { state } = useStore();
    const { deploy, undeploy } = useService('InstanceResourceService');
    const loading = useBusy('mountModResources');

    function getModItemFromModResource(resource: ForgeResource | FabricResource | LiteloaderResource): ModItem {
        const icon = `${resource.path.substring(0, resource.path.length - resource.ext.length)}.png`;
        let modItem: ModItem = {
            path: 'filePath' in resource ? (resource as any).filePath : resource.path,
            id: resource.path,
            name: resource.path,
            version: '',
            description: '',
            icon,
            acceptVersion: 'unknown',
            acceptLoaderVersion: 'unknown',
            type: 'forge',
            url: resource.source.uri[0],
            hash: resource.hash,
            tags: resource.tags,
            enabled: false,
            resource,
            subsequence: false,
            hide: false,
        };
        if (resource.type === 'forge') {
            if (!resource.metadata[0]) {
                modItem.type = 'forge';
                return modItem;
            }
            let meta = resource.metadata[0];
            let acceptVersion: string;
            if (meta.acceptedMinecraftVersions) {
                acceptVersion = meta.acceptedMinecraftVersions;
            } else if (meta.loaderVersion) {
                acceptVersion = '[1.15,)';
            } else {
                acceptVersion = 'unknown';
            }
            modItem.id = meta.modid;
            modItem.name = meta.displayName ?? meta.name ?? meta.modid;
            modItem.version = meta.version;
            modItem.description = meta.description ?? '';
            modItem.acceptVersion = acceptVersion;
            modItem.acceptLoaderVersion = meta.loaderVersion ?? 'unknown';
            return modItem;
        }
        if (resource.type === 'fabric') {
            modItem.id = resource.metadata.id;
            modItem.version = resource.metadata.version;
            modItem.name = resource.metadata.name ?? resource.metadata.id;
            modItem.description = resource.metadata.description ?? '';
            modItem.acceptVersion = '[*]';
            modItem.acceptLoaderVersion = '';
            modItem.type = 'fabric';
            return modItem;
        }
        modItem.type = 'liteloader';
        modItem.name = resource.metadata.name;
        modItem.version = resource.metadata.version ?? '';
        modItem.id = resource.metadata.name;
        modItem.description = modItem.description ?? '';
        if (resource.metadata.mcversion) {
            modItem.acceptVersion = `[${resource.metadata.mcversion}]`;
        }
        return modItem;
    }

    function getModItemFromResource(resource: Resource | InstanceResource): ModItem {
        if (isModResource(resource)) {
            return getModItemFromModResource(resource);
        }
        return {
            path: 'filePath' in resource ? resource.filePath : resource.path,
            id: 'filePath' in resource ? resource.filePath : resource.hash,
            name: resource.path,
            version: '',
            description: '',
            icon: '',
            acceptVersion: '[*]',
            type: 'unknown',
            url: resource.source.uri[0],
            acceptLoaderVersion: '',
            hash: resource.hash,
            tags: [],
            enabled: false,
            resource,
            subsequence: false,
            hide: false,
        };
    }

    /**
     * Commit the change for current mods setting
     */
    async function commit(items: ModItem[]) {
        const enabled = items.filter(m => m.enabled);
        const disabled = items.filter(m => !m.enabled);

        await Promise.all([
            deploy({ resources: enabled.map(m => m.resource) }),
            undeploy(disabled.map(m => m.resource as InstanceResource)),
        ]);
    }

    const enabled = computed(() => state.instance.mods.map(getModItemFromResource).map(m => { m.enabled = true; return m; }));
    const enabledHash = computed(() => new Set(state.instance.mods.map(m => m.hash)));
    const disabled = computed(() => state.resource.domains.mods
        .map(getModItemFromResource)
        .filter(mod => !enabledHash.value.has(mod.hash)));

    return {
        enabled,
        disabled,
        commit,
        loading,
    };
}
