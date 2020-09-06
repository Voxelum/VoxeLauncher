import unknownPack from '@/assets/unknown_pack.png';
import { CurseforgeModpackResource, ForgeResource, LiteloaderResource, ResourcePackResource, SaveResource, FabricResource } from '@universal/util/resource';
import { requireTrue } from '@universal/util/assert';
import { computed, Ref, ref } from '@vue/composition-api';
import { useServiceOnly } from './useService';
import { useStore } from './useStore';

export function useResourceOperation() {
    return {
        ...useServiceOnly('ResourceService', 'importResource', 'removeResource', 'parseFileAsResource'),
    };
}

/* eslint-disable import/export */
export function useResource(domain: 'mods'): {
    resources: Ref<Array<ForgeResource | LiteloaderResource | FabricResource>>;
} & ReturnType<typeof useResourceOperation>;
export function useResource(domain: 'resourcepacks'): {
    resources: Ref<Array<ResourcePackResource>>;
} & ReturnType<typeof useResourceOperation>;
export function useResource(domain: 'modpacks'): {
    resources: Ref<Array<CurseforgeModpackResource>>;
} & ReturnType<typeof useResourceOperation>;
export function useResource(domain: 'saves'): {
    resources: Ref<Array<SaveResource>>;
} & ReturnType<typeof useResourceOperation>;
export function useResource(domain: string) {
    const { state } = useStore();
    const resources = computed(() => state.resource.domains[domain]);
    return {
        ...useResourceOperation(),
        resources,
    };
}

function getResourcepackFormat(meta: any) {
    return meta ? meta.format || meta.pack_format : 3;
}

export function useResourcePackResource(resource: ResourcePackResource) {
    const { getters, state } = useStore();
    const metadata = computed(() => resource.metadata);

    const icon = `${state.root}/${resource.domain}/${resource.name}.${resource.hash.slice(0, 6)}.png`;
    const acceptedRange = computed(() => getters.getAcceptMinecraftRangeByFormat(getResourcepackFormat(resource.metadata)));

    return {
        name: resource.name,
        metadata,
        icon,
        acceptedRange,
    };
}

export function useCurseforgeImport() {
    return useServiceOnly('InstanceIOService', 'importCurseforgeModpack');
}

export function useForgeModResource(resource: ForgeResource) {
    requireTrue(resource.type === 'forge');
    const metadata = computed(() => (resource.metadata || [])[0] || {});
    const icon = ref(unknownPack);
    const acceptedRange = computed(() => {
        if (metadata.value.acceptedMinecraftVersions) {
            return metadata.value.acceptedMinecraftVersions;
        }
        if (metadata.value.mcversion) {
            const mcversion = metadata.value.mcversion;
            if (/^\[.+\]$/.test(mcversion)) {
                return mcversion;
            }
            return `[${mcversion}]`;
        }
        return 'unknown';
    });
    const acceptLoaderRange = computed(() => (metadata.value as any).loaderVersion as string || 'unknown');
    return {
        icon,
        metadata,
        acceptedRange,
        acceptLoaderRange,
    };
}
