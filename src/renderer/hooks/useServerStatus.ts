import unknownServer from '@/assets/unknown_server.png';
import { computed, reactive, Ref, ref, toRefs } from '@vue/composition-api';
import { useI18n } from './useI18n';
import { useService } from './useService';
import { useStore } from './useStore';

export function useSeverStatusAcceptVersion(protocol: Ref<number>) {
    const { getters } = useStore();
    return computed(() => `[${getters.getAcceptMinecraftsByProtocol(protocol.value).join(', ')}]`);
}

export function useInstanceServerStatus(instancePath?: string) {
    const { state } = useStore();

    const status = computed(() => state.instance.all[instancePath ?? state.instance.path].serverStatus);
    const acceptingVersion = useSeverStatusAcceptVersion(computed(() => status.value.version.protocol));
    const { refreshServerStatus } = useService('InstanceService');

    return {
        acceptingVersion,
        version: computed(() => status.value.version),
        players: computed(() => status.value.players),
        description: computed(() => status.value.description),
        favicon: computed(() => status.value.favicon || unknownServer),
        ping: computed(() => status.value.ping),
        refresh: refreshServerStatus,
    };
}

export function useServer(serverRef: Ref<{ host: string; port?: number }>, protocol: Ref<number | undefined>) {
    const { pingServer } = useService('ServerStatusService');
    const { $t } = useI18n();
    const status = reactive({
        version: {
            name: '',
            protocol: 0,
        },
        players: {
            max: 0,
            online: 0,
        },
        description: '',
        favicon: unknownServer,
        ping: -1,
    });
    const pinging = ref(false);
    /**
     * Refresh the server status. If the server is empty, it will do nothing.
     */
    async function refresh() {
        pinging.value = true;
        const server = serverRef.value;
        if (!server.host) return;
        status.description = $t('profile.server.status.ping');
        status.favicon = unknownServer;

        let result = await pingServer({
            host: server.host,
            port: server.port,
            protocol: protocol.value,
        }).finally(() => {
            pinging.value = false;
        });
        status.description = result.description as any;
        status.players = result.players;
        status.version = result.version;
        status.favicon = result.favicon;
        status.ping = result.ping;
        /* .catch((e) => {
            if (e.code === 'ENOTFOUND') {
                status.value.description = $t('profile.server.status.nohost');
            } else if (e.code === 'ETIMEOUT') {
                status.value.description = $t('profile.server.status.timeout');
            } else if (e.code === 'ECONNREFUSED') {
                status.value.description = $t('profile.server.status.refuse');
            } else {
                status.value.description = '';
            }
        }); */
    }

    function reset() {
        status.description = '';
        status.players = { max: 0, online: 0 };
        status.version = { name: '', protocol: 0 };
        status.favicon = unknownServer;
        status.ping = -1;
    }

    const acceptingVersion = useSeverStatusAcceptVersion(computed(() => status.version.protocol));
    return {
        acceptingVersion,
        ...toRefs(status),
        pinging,
        refresh,
        reset,
    };
}
