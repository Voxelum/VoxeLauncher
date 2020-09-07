<template>
  <v-container
    grid-list-md
    text-xs-center
    style="padding-left: 30px; padding-right: 30px; z-index: 1"
    @dragover.prevent
  >
    <transition
      name="scale-transition"
      mode="out-in"
    >
      <v-btn
        v-if="draggingInstance.path === ''"
        :key="0"
        absolute
        fab
        color="primary"
        style="right: 20px; bottom: 20px; transition: all 0.15s ease;"
        :loading="pinging"
        @click="refresh"
      >
        <v-icon>refresh</v-icon>
      </v-btn>
      <v-btn
        v-else
        :key="1"
        absolute
        fab
        color="red"
        style="right: 20px; bottom: 20px; transition: all 0.15s ease;"
        :loading="pinging"
        @drop="drop"
      >
        <v-icon>delete</v-icon>
      </v-btn>
    </transition>
    <v-layout row>
      <v-flex xs10>
        <v-text-field
          ref="filterElem"
          v-model="filter"
          hide-details
          append-icon="filter_list"
          :label="$t('filter')"
          solo
          dark
          color="green darken-1"
        />
      </v-flex>
      <v-flex xs1>
        <create-button @create="onCreate" />
      </v-flex>
      <v-flex xs1>
        <import-button @import="onImport" />
      </v-flex>
    </v-layout>
    <instances-view
      :instances="instances"
      :select="selectInstance"
      @select="selectInstance"
      @dragstart="dragStart"
      @dragend="dragEnd"
    />

    <delete-dialog
      :instance="deletingInstance"
      :confirm="doDelete"
      :cancel="cancelDelete"
    />
    <v-dialog
      v-model="wizard"
      persistent
    >
      <add-instance-stepper
        v-if="!creatingServer"
        :show="wizard"
        @quit="wizard=false"
      />
      <add-server-stepper
        v-else
        :show="wizard"
        @quit="wizard=false"
      />
    </v-dialog>
  </v-container>
</template>

<script lang=ts>
import { reactive, toRefs, computed, onMounted, defineComponent, Ref, ref, onUnmounted } from '@vue/composition-api';
import {
  useI18n,
  useNativeDialog,
  useRouter,
  useInstances,
  useResourceOperation,
  useCurseforgeImport,
  useOperation,
} from '@/hooks';
import { Notify, useNotifier, useSearch, useSearchToggle } from '../hooks';
import AddInstanceStepper from './InstancesPageAddInstanceStepper.vue';
import AddServerStepper from './InstancesPageAddServerStepper.vue';
import InstancesView from './InstancesPageInstancesView.vue';
import DeleteDialog from './InstancesPageDeleteDialog.vue';
import ImportButton from './InstancesPageImportButton.vue';
import CreateButton from './InstancesPageCreateButton.vue';

function useRefreshInstance(notify: Notify) {
  const { $t } = useI18n();
  const pinging = ref(false);
  const { refreshServerStatusAll } = useInstances();
  return {
    pinging,
    refresh() {
      if (pinging.value) return;
      pinging.value = true;
      refreshServerStatusAll().then(() => {
        notify({ level: 'success', title: $t('profile.refreshServers') });
      }, (e) => {
        notify({ level: 'error', title: $t('profile.refreshServers') });
      }).finally(() => {
        pinging.value = false;
      });
    },
  };
}

function setupInstanceCreation() {
  const data = reactive({
    wizard: false,
    creatingServer: false,
    creatingTooltip: false,
  });
  return {
    ...toRefs(data),
    onCreate(type: 'server' | 'instance') {
      if (type === 'server') {
        data.creatingTooltip = false;
        data.creatingServer = true;
        data.wizard = true;
      } else {
        data.creatingTooltip = false;
        data.creatingServer = false;
        data.wizard = true;
      }
    },
  };
}

function setupInstanceImport() {
  const { importInstance } = useInstances();
  const { showOpenDialog } = useNativeDialog();
  const { $t } = useI18n();
  const { importResource } = useResourceOperation();
  const { importCurseforgeModpack } = useCurseforgeImport();
  async function onImport(type: 'zip' | 'folder' | 'curseforge') {
    const fromFolder = type === 'folder';
    const filters = fromFolder
      ? []
      : [{ extensions: ['zip'], name: 'Zip' }];
    const { filePaths } = await showOpenDialog({
      title: $t('profile.import.title'),
      message: $t('profile.import.description'),
      filters,
      properties: fromFolder ? ['openDirectory'] : ['openFile'],
    });
    if (filePaths && filePaths.length > 0) {
      for (const f of filePaths) {
        if (type === 'curseforge') {
          await importResource({
            path: f,
            type: 'curseforge-modpack',
            background: true,
          });
          await importCurseforgeModpack({ path: f });
        } else {
          await importInstance(f);
        }
      }
    }
  }
  return {
    onImport,
  };
}

function setupDelete(deleteInstance: (path: string) => Promise<void>) {
  const defaultInstance = { path: '', name: '' };
  const { cancel: cancelDelete, operate: doDelete, begin: startDelete, data: deletingInstance } = useOperation(defaultInstance, async (instance) => {
    if (instance && 'path' in instance) {
      await deleteInstance(instance.path).catch(() => {
      });
    }
  });
  const { begin: dragStart, cancel: dragEnd, operate: drop, data: draggingInstance } = useOperation(defaultInstance, (inst) => {
    startDelete(inst);
  });
  return {
    dragStart,
    dragEnd,
    drop,
    draggingInstance,

    cancelDelete: () => setTimeout(cancelDelete, 100),
    doDelete,
    deletingInstance,
  };
}

export default defineComponent({
  components: {
    AddInstanceStepper,
    AddServerStepper,
    DeleteDialog,
    ImportButton,
    CreateButton,
    InstancesView,
  },
  setup() {
    const { mountInstance: selectInstance, deleteInstance, instances } = useInstances();
    const { notify } = useNotifier();
    const { replace } = useRouter();
    const { text: filter } = useSearch();

    const filterElem = ref(null) as Ref<any>;

    const filteredInstance = computed(() => {
      const filterString = filter.value.toLowerCase();
      return instances.value.filter(
        profile => filterString === ''
          || (profile.author
            ? profile.author.toLowerCase().indexOf(filterString) !== -1
            : false)
          || profile.name.toLowerCase().indexOf(filterString) !== -1
          || (profile.description
            ? profile.description.toLowerCase().indexOf(filterString) !== -1
            : false),
      );
    });

    function focusSearch(force?: boolean) {
      if (force) {
        filterElem.value.blur();
      } else if (filterElem.value.isFocused) {
        filterElem.value.blur();
      } else {
        filterElem.value.focus();
      }
      return false;
    }

    useSearchToggle(focusSearch);

    return {
      // drag instance to delete
      ...setupDelete(deleteInstance),

      // instances display
      instances: filteredInstance,
      filter,

      // refresh instance operations
      ...useRefreshInstance(notify),

      // instance creation status
      ...setupInstanceCreation(),
      ...setupInstanceImport(),

      selectInstance(path: string) {
        selectInstance(path);
        replace('/');
      },
      filterElem,
    };
  },
  methods: {},
});
</script>

<style>
.ghost {
  opacity: 0.5;
}
</style>
