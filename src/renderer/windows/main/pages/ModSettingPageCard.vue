<template>
  <v-card
    v-selectable-card
    v-long-press="emitSelect"
    hover
    :draggable="!enabled"
    :dark="!source.subsequence"
    :class="{ 
      grey: source.subsequence,
      'darken-2': source.subsequence,
      incompatible: compatible === false,
      maybe: compatible === 'maybe',
      unknown: compatible === 'unknown', 
      subsequence: source.subsequence,
      dragged: dragged,
    }"
    class="white--text draggable-card"
    style="margin-top: 10px; padding: 0 10px; transition-duration: 0.2s;"
    @dragstart="onDragStart"
    @dragend="$emit('dragend', $event)"
    @mouseenter="$emit('mouseenter', $event)"
    @contextmenu="onContextMenu"
    @click="$emit('click', $event)"
  >
    <v-tooltip top>
      <template v-slot:activator="{ on }">
        <transition-group
          class="layout justify-center align-center fill-height"
          name="transition-list"
          tag="div"
          style="user-select: none"
          v-on="on"
        >
          <v-flex v-if="selection" :key="0" style="flex-grow: 0">
            <v-checkbox :value="selected"></v-checkbox>
          </v-flex>
          <v-flex
            v-if="!source.subsequence"
            :key="1"
            style="margin: 0 10px 0 0; min-height: 126px; max-height: 126px; max-width: 126px; min-width; 126px"
          >
            <img
              ref="iconImage"
              v-fallback-img="unknownPack"
              :src="source.icon"
              style="min-height: 126px; max-height: 126px; max-width: 126px; min-width; 126px"
              contain
            />
          </v-flex>
          <v-flex :key="2" style="padding: 10px 0; flex-grow: 1">
            <h3 v-if="!source.subsequence">{{ source.name }}</h3>
            <v-chip
              small
              outline
              label
              color="amber"
              style="margin-left: 1px;"
            >
              {{ source.version }}
            </v-chip>
            <v-chip
              small
              outline
              color="orange darken-1"
              label
              style="margin-left: 1px;"
            >
              {{ source.id }}
            </v-chip>
            <v-chip
              small
              outline
              label
              color="lime"
              style="margin-left: 1px;"
            >
              {{ source.type }}
            </v-chip>
            <div style="color: #bdbdbd; ">{{ source.description }}</div>
          </v-flex>
          <v-flex :key="3" style="flex-grow: 0" @click.stop @mousedown.stop>
            <v-switch :value="enabled" @change="emitEnable"></v-switch>
          </v-flex>
        </transition-group>
      </template>
      {{ compatibleText }}
      <v-divider />
    </v-tooltip>
  </v-card>
</template>

<script lang=ts>
import { defineComponent, ref, Ref, computed, inject, watch } from '@vue/composition-api';
import { useInstanceVersionBase, useCompatible, useService, ModItem, useI18n } from '@/hooks';
import unknownPack from '@/assets/unknown_pack.png';
import { required } from '@/util/props';
import { useContextMenu, ContextMenuItem, useCurseforgeRoute, useMcWikiRoute } from '../hooks';

export default defineComponent({
  props: {
    source: required<ModItem>(Object),
    selected: required<boolean>(Boolean),
    enabled: required<boolean>(Boolean),
    dragged: required<boolean>(Boolean),
    selection: required<boolean>(Boolean),
  },
  setup(props, context) {
    const { minecraft, forge } = useInstanceVersionBase();
    const { compatible: mcCompatible } = useCompatible(computed(() => props.source.acceptVersion), minecraft, true);
    const { compatible: loaderCompatible } = useCompatible(computed(() => props.source.acceptLoaderVersion), forge, false);
    const { open } = useContextMenu();
    const { openInBrowser, showItemInDirectory } = useService('BaseService');
    const { searchProjectAndRoute, goProjectAndRoute } = useCurseforgeRoute();
    const { searchProjectAndRoute: searchMcWiki } = useMcWikiRoute(); 
    const { $t } = useI18n();

    const iconImage: Ref<HTMLImageElement | null> = ref(null);
    
    const compatible = computed(() => {
      if (mcCompatible.value === true) {
        if (loaderCompatible.value === true) {
          return true;
        }
        return 'maybe';
      }
      if (mcCompatible.value === 'unknown') {
        if (loaderCompatible.value === true) {
          return true;
        }
        return 'unknown';
      }
      return false;
    });

    const compatibleText = computed(() => {
      let acceptVersionText = $t('mod.acceptVersion', { version: props.source.acceptVersion, loaderVersion: props.source.acceptLoaderVersion });
      let compatibleText = compatible.value === 'unknown'
        ? $t('mod.nocompatible')
        : compatible.value
          ? $t('mod.compatible')
          : $t('mod.incompatible');
      return compatibleText + acceptVersionText;
    });

    function onDragStart(e: DragEvent) {
      if (props.enabled) {
        return;
      }
      if (iconImage.value) {
        e.dataTransfer!.setDragImage(iconImage.value!, 0, 0);
      } else {
        let img = document.createElement('img');
        img.src = props.source.icon;
        img.style.maxHeight = '126px';
        img.style.maxWidth = '126px';
        img.style.objectFit = 'contain';

        e.dataTransfer!.setDragImage(img, 0, 0);
      }
      e.dataTransfer!.effectAllowed = 'move';
      e.dataTransfer!.setData('id', props.source.url);
      context.emit('dragstart', e);
    }
    function onContextMenu(e: MouseEvent) {
      let items: ContextMenuItem[] = [{
        text: $t('mod.showFile', { file: props.source.path }),
        children: [],
        onClick: () => {
          showItemInDirectory(props.source.path);
        },
        icon: 'folder',
      }];
      if (props.source.resource.source.uri.find(u => u.startsWith('http'))) {
        let url = props.source.resource.source.uri.find(u => u.startsWith('http'))!;
        items.push({
          text: $t('mod.openLink', { url }),
          children: [],
          onClick: () => {
            openInBrowser(url);
          },
          icon: 'link',
        });
      }
      if (props.source.resource.source.curseforge) {
        items.push({
          text: $t('mod.showInCurseforge', { name: props.source.name }),
          children: [],
          onClick: () => {
            goProjectAndRoute(props.source.resource.source.curseforge!.projectId, 'mc-mods');
          },
          icon: '$vuetify.icons.curseforge',
        });
      } else {
        items.push({
          text: $t('mod.searchOnCurseforge', { name: props.source.name }),
          children: [],
          onClick: () => {
            searchProjectAndRoute(props.source.name, 'mc-mods');
          },
          icon: 'search',
        });
      }
      items.push({
        text: $t('mod.searchOnMcWiki', { name: props.source.name }),
        children: [],
        onClick: () => {
          searchMcWiki(props.source.name);
        },
        icon: 'search',
      });
      open(e.clientX, e.clientY, items);
    }
    function emitSelect() {
      context.emit('select');
    }
    function emitEnable(event: any) {
      context.emit('enable', event);
    }

    return {
      iconImage,
      compatible,
      onDragStart,
      minecraft,
      onContextMenu,
      unknownPack,

      mcCompatible,
      compatibleText,
      emitSelect,
      emitEnable,
    };
  },
});
</script>

<style scoped=true>
.draggable-card:hover {
  background-color: #388e3c;
}

.unknown:hover {
  background-color: #bb724b;
}
.maybe:hover {
}
.title {
  max-width: 100%;
  white-space: nowrap;
}
.subsequence {
  margin-left: 40px;
}
.incompatible.draggable-card:hover {
  background-color: #e65100;
}
.subsequence.incompatible.draggable-card:hover {
  background-color: #e65100 !important;
}
</style>
