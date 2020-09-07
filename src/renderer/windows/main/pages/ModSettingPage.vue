<template>
  <v-container
    fill-height
    style="overflow: auto;"
    @dragend="onDrageEnd"
    @dragover.prevent="onDragOver"
    @drop="onDropToImport"
  >
    <v-layout
      column
      fill-height
      style="max-height: 100%;"
    >
      <v-toolbar
        dark
        flat
        color="transparent"
      >
        <v-toolbar-title>{{ $tc('mod.name', 2) }}</v-toolbar-title>
        <v-spacer />
        <v-tooltip bottom>
          <template v-slot:activator="{ on }">
            <v-btn
              icon
              v-on="on"
              @click="filterInCompatible = !filterInCompatible"
            >
              <v-icon>{{ filterInCompatible ? 'visibility' : 'visibility_off' }}</v-icon>
            </v-btn>
          </template>
          {{ filterInCompatible ? $t('mod.showIncompatible') : $t('mod.hideIncompatible') }}
        </v-tooltip>
        <v-tooltip bottom>
          <template v-slot:activator="{ on }">
            <v-btn
              icon
              v-on="on"
              @click="toggle()"
            >
              <v-icon>search</v-icon>
            </v-btn>
          </template>
          {{ $t('filter') }}
        </v-tooltip>
      </v-toolbar>
      <v-flex
        d-flex
        xs12
        style="padding-right: 5px; display: flex; flex-direction: column;"
      >
        <hint
          v-if="items.length === 0"
          icon="save_alt"
          :text="$t('mod.hint')"
          :absolute="true"
          style="height: 100%"
        />
        <v-list
          v-else
          class="list"
          style="overflow-y: auto; background: transparent;"
        >
          <transition-group
            name="transition-list"
            tag="div"
            :class="{ 'selection-mode': isSelectionMode }"
          >
            <mod-card
              v-for="(item, index) in items"
              :key="item.url"
              v-observe-visibility="(visible) => onVisible(visible, index)"
              class="list-item"
              :source="item"
              :selection="isSelectionMode"
              :selected="isSelected(item)"
              :enabled="isModModified(item)"
              :dragged="isDragged(item)"
              @dragstart="onItemDragstart($event, item)"
              @select="select(item)"
              @click="onClick($event, index)"
              @enable="modifyMod(item, $event)"
            />
          </transition-group>
        </v-list>
      </v-flex>
    </v-layout>
    <float-button
      :deleting="isDraggingMod"
      :visible="isDraggingMod || isModified"
      :loading="saving"
      @drop="onDropDelete"
      @click="save"
    />
    <v-dialog
      :value="deletingMods.length !== 0"
      width="400"
      persistance
      @input="cancelDelete"
    >
      <delete-view
        :confirm="confirmDelete"
        :cancel="cancelDelete"
        :items="deletingMods"
      />
    </v-dialog>
  </v-container>
</template>

<script lang=ts>
import VirtualList from 'vue-virtual-scroll-list';
import { defineComponent, reactive, toRefs, computed, ref, Ref, provide, watch, onMounted, onUnmounted } from '@vue/composition-api';
import { ForgeResource, LiteloaderResource } from '@universal/util/resource';
import {
  useInstanceMods,
  useResourceOperation,
  useInstanceVersionBase,
  useDropImport,
  useDropImportFile,
  ModItem,
  useOperation,
  useDrop,
} from '@/hooks';
import { isCompatible } from '@universal/util/version';
import { useLocalStorageCacheBool } from '@/hooks/useCache';
import { filter } from 'fuzzy';
import { set } from '@universal/util/middleware';
import { isNonnull } from '@universal/util/assert';
import { useSearchToggles, useSearch } from '../hooks';
import ModCard from './ModSettingPageCard.vue';
import DeleteView from './ModSettingPageDeleteView.vue';
import FloatButton from './ModSettingPageFloatButton.vue';

type ModResource = ForgeResource | LiteloaderResource;

function setupDragMod(items: Ref<ModItem[]>, selectedMods: Ref<ModItem[]>, isSelectionMode: Ref<boolean>) {
  const dragged = reactive({} as Record<string, boolean>);
  const isDraggingMod = computed(() => Object.values(dragged).some((v) => v));

  watch(items, (arr) => {
    for (const m of arr) {
      if (!(m.hash in dragged)) {
        dragged[m.hash] = false;
      }
    }
  });

  function isDragged(mod: ModItem) {
    if (!(mod.hash in dragged)) {
      set(dragged, mod.hash, false);
    }
    return dragged[mod.hash];
  }
  function onItemDragstart(event: DragEvent, mod: ModItem) {
    if (isSelectionMode.value && selectedMods.value.some(m => m.id === mod.id)) {
      event.dataTransfer!.setData('mods', selectedMods.value.map(m => m.id).join(','));
      selectedMods.value.forEach((m) => { dragged[m.hash] = true; });
    } else {
      event.dataTransfer!.setData('mod', mod.id);
      dragged[mod.hash] = true;
    }
  }
  function onDrageEnd() {
    Object.keys(dragged).forEach((k) => { dragged[k] = false; });
  }
  return {
    isDraggingMod,
    isDragged,
    onDrageEnd,
    onItemDragstart,
  };
}

function setupEnable(isSelectionMode: Ref<boolean>, selectedMods: Ref<ModItem[]>, isSelected: (mod: ModItem) => boolean, commit: (mods: ModItem[]) => Promise<void>) {
  const modifiedItems = ref([] as ModItem[]);
  const isModified = computed(() => modifiedItems.value.length > 0);
  const saving = ref(false);
  function modifyMod(mod: ModItem, value: boolean) {
    value = !!value;
    const update = (m: ModItem, newValue: boolean) => {
      if (newValue !== m.enabled && modifiedItems.value.every(i => i.id !== m.id)) {
        modifiedItems.value.push({ ...m, enabled: newValue });
      } else if (newValue === m.enabled && modifiedItems.value.some(i => i.id === m.id)) {
        modifiedItems.value = modifiedItems.value.filter((v) => v.id !== m.id);
      }
    };
    if (isSelectionMode.value && isSelected(mod)) {
      for (const mod of selectedMods.value) {
        update(mod, value);
      }
    } else {
      update(mod, value);
    }
  }
  function isModModified(mod: ModItem) {
    return modifiedItems.value.some((i) => i.id === mod.id);
  }
  function save() {
    if (saving.value) return;
    saving.value = true;
    commit(modifiedItems.value).finally(() => {
      let handle = watch(isModified, (n, o) => {
        if (typeof o === 'undefined') return;
        saving.value = false;
        handle();
      });
    });
  }
  return { isModModified, modifyMod, isModified, saving, save };
}

function setupDeletion(mods: Ref<ModItem[]>) {
  const { removeResource } = useResourceOperation();
  const { begin: beginDelete, cancel: cancelDelete, operate: confirmDelete, data: deletingMods } = useOperation<ModItem[]>([], (mods) => {
    for (const mod of mods) {
      removeResource(mod.hash);
    }
  });
  function onDropDelete(e: DragEvent) {
    const modId = e.dataTransfer!.getData('mod');
    if (modId) {
      const target = mods.value.find(m => m.id === modId);
      if (target) {
        beginDelete([target]);
      }
    }
    const modIds = e.dataTransfer!.getData('mods');
    if (modIds) {
      const toDeletes = modIds.split(',').map((id) => mods.value.find(m => m.id === id)).filter(isNonnull);
      if (toDeletes.length > 0) {
        beginDelete(toDeletes);
      }
    }
  }
  return {
    deletingMods,
    onDropDelete,
    confirmDelete,
    cancelDelete,
  };
}

function setupSelection(items: Ref<ModItem[]>) {
  const isSelectionMode = ref(false);
  const selectedItems = reactive({} as Record<string, boolean>);
  const selectedMods = computed(() => items.value.filter(i => selectedItems[i.hash]));
  watch(items, (arr) => {
    for (const m of arr) {
      if (!(m.hash in selectedItems)) {
        selectedItems[m.hash] = false;
      }
    }
  });

  function select(...mod: ModItem[]) {
    if (!isSelectionMode.value) {
      isSelectionMode.value = true;
    }
    for (const m of mod) {
      selectedItems[m.hash] = !selectedItems[m.hash];
    }
  }
  function selectOrUnselect(mod: ModItem) {
    if (isSelectionMode.value) {
      selectedItems[mod.hash] = !selectedItems[mod.hash];
    }
  }
  function isSelected(mod: ModItem) {
    if (!(mod.hash in selectedItems)) {
      set(selectedItems, mod.hash, false);
    }
    return selectedItems[mod.hash];
  }
  let lastIndex = -1;
  function onClick(event: MouseEvent, index: number) {
    if (lastIndex !== -1 && event.shiftKey) {
      let min = lastIndex;
      let max = index;
      if (lastIndex > index) {
        max = lastIndex;
        min = index;
      }
      select(...items.value.slice(min + 1, max));
    }
    selectOrUnselect(items.value[index]);
    lastIndex = index;
  }
  function onKeyup(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      isSelectionMode.value = false;
      Object.keys(selectedItems).forEach((k) => { selectedItems[k] = false; });
    }
  }
  onMounted(() => {
    document.addEventListener('keyup', onKeyup);
  });
  onUnmounted(() => {
    document.removeEventListener('keyup', onKeyup);
  });
  return {
    onClick,
    select,
    isSelectionMode,
    isSelected,
    selectedMods,
  };
}

export default defineComponent({
  components: {
    ModCard,
    DeleteView,
    VirtualList,
    FloatButton,
  },
  setup() {
    const data = reactive({
      filterInCompatible: useLocalStorageCacheBool('ModSettingPage.filterInCompatible', false),
      filterModId: '',

      visibleCount: 10,
    });
    const { minecraft } = useInstanceVersionBase();
    const { importResource } = useResourceOperation();
    const { enabled, disabled, commit } = useInstanceMods();
    const { toggle } = useSearchToggles();
    const { text: filteredText } = useSearch();

    const mods = computed(() => [
      ...enabled.value,
      ...disabled.value,
    ]);

    function isCompatibleMod(mod: ModItem) {
      if (data.filterInCompatible) {
        return isCompatible(mod.acceptVersion, minecraft.value);
      }
      return true;
    }
    function isDuplicated(list: ModItem[], mod: ModItem): ModItem[] {
      let existed = list.findIndex(v => v.id === mod.id && v.type === mod.type);
      if (existed !== -1) {
        list.splice(existed + 1, 0, mod);
        mod.subsequence = true;
      } else {
        list.push(mod);
        mod.subsequence = false;
      }
      return list;
    }
    const items = computed(() => filter(filteredText.value, mods.value, { extract: v => `${v.name} ${v.version} ${v.acceptVersion}` })
      .map((r) => r.original)
      .filter(isCompatibleMod)
      .reduce(isDuplicated, [])
      .filter((m, i) => i < data.visibleCount));

    const selection = setupSelection(items);
    const { isSelectionMode, selectedMods, isSelected } = selection;

    const { onDrop: onDropToImport } = useDrop((file) => {
      importResource({ type: 'mods', path: file.path });
    });
    
    function setFilteredModid(mod: ModItem) {
      data.filterModId = mod.id;
    }
    function onVisible(visible: boolean, index: number) {
      if (!visible) return;
      if (data.visibleCount < index + 20) {
        data.visibleCount += 20;
      }
    }
    function onDragOver(event: DragEvent) {
      // console.log(event);
    }
    return {
      ...toRefs(data),
      ...setupDragMod(items, selectedMods, isSelectionMode),
      ...setupEnable(isSelectionMode, selectedMods, isSelected, commit),
      ...setupDeletion(mods),

      onVisible,

      items,
      onDropToImport,
      onDragOver,
      setFilteredModid,
      toggle,
      ModCard,

      ...selection,
    };
  },
});
</script>

<style>
</style>
