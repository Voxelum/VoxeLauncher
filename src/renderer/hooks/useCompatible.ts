import { isCompatible } from '@universal/entities/version';
import { computed, Ref } from '@vue/composition-api';
import { useStore } from './useStore';

export function useCompatible(acceptedRange: Ref<string>, version: Ref<string>, strict = true) {
    const compatible = computed(() => (acceptedRange.value !== 'unknown'
        ? version.value === '' && !strict
            ? true
            : isCompatible(acceptedRange.value, version.value)
        : 'unknown'));
    return { compatible };
}


export function useCompatibleWithLoader(acceptedRange: Ref<string>,
    loaderRange: Ref<string>,
    mcVersion: Ref<string>,
    forgeVersion: Ref<string>) {
    // eslint-disable-next-line no-nested-ternary
    const compatible: Ref<boolean | 'unknown' | 'maybe'> = computed(() => (
        acceptedRange.value !== 'unknown'
            ? isCompatible(acceptedRange.value, mcVersion.value)
            : loaderRange.value !== 'unknown'
                ? isCompatible(loaderRange.value, mcVersion.value.substring(2))
                : 'unknown'));
    return { compatible };
}

export function useIsCompatible() {
    return { isCompatible };
}
