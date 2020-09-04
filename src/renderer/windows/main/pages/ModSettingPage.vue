<template>
  <v-container
    fill-height
    style="overflow: auto;"
    @dragend="draggingMod = false"
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
            :class="{ 'selection-mode': selectionMode }"
          >
            <mod-card
              v-for="(item, index) in items"
              :key="item.url"
              v-observe-visibility="(visible) => onVisible(visible, index)"
              :source="item"
              class="list-item"
              :selected="isSelected(item)"
              :enabled="isEnabled(item)"
              @select="select(item)"
              @click="onClick($event, index)"
              @enable="enableMod(item, $event)"
            />
          </transition-group>
        </v-list>
      </v-flex>
    </v-layout>
    <float-button
      :deleting="draggingMod"
      :visible="draggingMod || modified"
      :loading="saving"
      @drop="onDropMod"
      @click="save"
    />
    <v-dialog
      :value="!!deletingMod"
      width="400"
      persistance
      @input="deletingMod=$event"
    >
      <delete-view
        :confirm="confirmDelete"
        :cancel="cancelDelete"
        :name="deletingMod ? deletingMod.name + '-' + deletingMod.version : ''"
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
import { useSearchToggles, useSearch } from '../hooks';
import ModCard from './ModSettingPageCard.vue';
import DeleteView from './ModSettingPageDeleteView.vue';
import FloatButton from './ModSettingPageFloatButton.vue';

type ModResource = ForgeResource | LiteloaderResource;

function useDragMod() {
  const draggingMod = ref(false);
  provide('DraggingMod', draggingMod);
  return {
    draggingMod,
  };
}

function setupSelection(items: Ref<ModItem[]>) {
  const selectionMode = ref(false);
  provide('SelectionMode', selectionMode);
  const selectedItems = reactive({} as Record<string, boolean>);
  const selectedMods = computed(() => items.value.filter(i => selectedItems[i.hash]));
  watch(items, (arr) => {
    console.log('watch trigger');
    for (const m of arr) {
      if (!(m.hash in selectedItems)) {
        selectedItems[m.hash] = false;
      }
    }
  });
 
  function select(...mod: ModItem[]) {
    if (!selectionMode.value) {
      selectionMode.value = true;
    }
    for (const m of mod) {
      selectedItems[m.hash] = !selectedItems[m.hash];
    }
  }
  function selectOrUnselect(mod: ModItem) {
    if (selectionMode.value) {
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
  return {
    onClick,
    select,
    selectOrUnselect,
    selectedItems,
    selectionMode,
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

      saving: false,
      visibleCount: 10,
    });
    provide('HoveringMod', ref(''));
    const { minecraft } = useInstanceVersionBase();
    const { importResource } = useResourceOperation();
    const { enabled, disabled, commit } = useInstanceMods();
    const { removeResource } = useResourceOperation();
    const { toggle } = useSearchToggles();
    const { text: filteredText } = useSearch();
    const { begin: beginDelete, cancel: cancelDelete, operate: confirmDelete, data: deletingMod } = useOperation<ModItem | undefined>(undefined, (mod) => {
      removeResource(mod!.hash);
    });

    
    const mods = computed(() => [
      ...enabled.value,
      ...disabled.value,
    ]);

    const modifiedList = ref([] as ModItem[]);
    provide('Modified', modifiedList);
    const modified = computed(() => modifiedList.value.length > 0);

    function isCompatibleMod(mod: ModItem) {
      if (data.filterInCompatible) {
        return isCompatible(mod.acceptVersion, minecraft.value);
      }
      return true;
    }
    function isDuplicated(list: ModItem[], mod: ModItem): ModItem[] {
      // if (data.filterModId) {
      //   if (mod.id === data.filterModId) {
      //     list.push(mod);
      //   }
      //   return list;
      // }
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
    const items = computed(() => filter(filteredText.value, mods.value, { extract: v => v.name })
      .map((r) => r.original)
      .filter(isCompatibleMod)
      .reduce(isDuplicated, [])
      .filter((m, i) => i < data.visibleCount));
    const selection = setupSelection(items);
    const { selectionMode, selectedMods, isSelected } = selection;

    function enableMod(mod: ModItem, value: boolean) {
      value = !!value;
      const update = (m: ModItem, newValue: boolean) => {
        if (newValue !== m.enabled && modifiedList.value.every(i => i.id !== m.id)) {
          modifiedList.value.push({ ...m, enabled: newValue });
        } else if (newValue === m.enabled && modifiedList.value.some(i => i.id === m.id)) {
          modifiedList.value = modifiedList.value.filter((v) => v.id !== m.id);
        }
      };
      if (selectionMode.value && isSelected(mod)) {
        for (const mod of selectedMods.value) {
          update(mod, value);
        }
      } else {
        update(mod, value);
      } 
    }
    function isEnabled(mod: ModItem) {
      return modifiedList.value.some((i) => i.id === mod.id);
    }
    function save() {
      if (data.saving) return;
      data.saving = true;
      commit(modifiedList.value).finally(() => {
        let handle = watch(modified, (n, o) => {
          if (typeof o === 'undefined') return;
          data.saving = false;
          handle();
        });
      });
    }
    const { onDrop: onDropToImport } = useDrop((file) => {
      importResource({ type: 'mods', path: file.path });
    });

    function onDropMod(e: DragEvent) {
      const url = e.dataTransfer!.getData('id');
      const target = mods.value.find(m => m.url === url);
      deletingMod.value = target;
    }
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
      console.log(event);
    }
    function onKeyup(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        selectionMode.value = false;
      }
    }
    onMounted(() => {
      document.addEventListener('keyup', onKeyup);
    });
    onUnmounted(() => {
      document.removeEventListener('keyup', onKeyup);
    });
    return {
      ...toRefs(data),
      ...useDragMod(),

      onVisible,

      items,
      beginDelete,
      cancelDelete,
      confirmDelete,
      deletingMod,

      onDropMod,
      onDropToImport,
      onDragOver,
      setFilteredModid,
      toggle,
      ModCard,
      save,
      modified,

      enableMod,
      isEnabled,
      
      ...selection,
    };
  },
});
</script>

<style>
</style>
