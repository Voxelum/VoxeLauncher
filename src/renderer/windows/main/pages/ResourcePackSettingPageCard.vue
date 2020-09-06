<template>
  <v-card
    ref="card"
    v-draggable-card
    color="darken-1"
    hover
    draggable
    :class="{ incompatible: !compatible }"
    class="draggable-card white--text elevation-4"
    style="margin-top: 10px;"
    @dragstart="onDragStart"
    @dragend.prevent="onDragEnd"
    @contextmenu="openContextMenu"
  >
    <v-tooltip top>
      <template v-slot:activator="{ on }">
        <v-layout
          justify-center
          align-center
          fill-height
          v-on="on"
        >
          <v-flex
            xs6
            style="padding: 0;"
          >
            <v-img
              ref="iconImage"
              style="user-drag: none; user-select: none; height: 125px;"
              :src="pack.icon"
              contain
            />
          </v-flex>
          <v-flex
            xs6
            style="padding-top: 10px;"
          >
            <text-component
              style="white-space: normal; word-break: break-word;"
              :source="pack.name"
              class="title"
            />
            <br />
            <text-component
              style="white-space: normal; word-break: break-word;"
              :source="pack.description"
            />
          </v-flex>
        </v-layout>
      </template>
      <span>
        {{ compatible ? $t('resourcepack.compatible', { format: pack.pack_format, version: mcversion }) : $t('resourcepack.incompatible', {
          accept: pack.acceptingRange,
          actual: mcversion,
          format: pack.pack_format
        }) }}
      </span>
    </v-tooltip>
  </v-card>
</template>

<script lang=ts>
import { defineComponent, reactive, ref, toRefs, Ref, computed } from '@vue/composition-api';
import { useInstanceVersionBase, useCompatible, useDragTransferItem, ResourcePackItem, useI18n, useService } from '@/hooks';
import { required } from '@/util/props';
import { useContextMenu, ContextMenuItem, useCurseforgeRoute } from '../hooks';

export default defineComponent({
  props: {
    pack: required<ResourcePackItem>(Object), 
    isSelected: required<boolean>(Boolean),
  },
  setup(props, context) {
    const iconImage: Ref<any> = ref(null);
    const { minecraft } = useInstanceVersionBase();
    const { compatible } = useCompatible(computed(() => props.pack.acceptingRange), minecraft);
    const { open } = useContextMenu();
    const { $t } = useI18n();
    const { searchProjectAndRoute, goProjectAndRoute } = useCurseforgeRoute();
    const { showItemInDirectory } = useService('BaseService');
    const card: Ref<Vue | null> = ref(null);

    useDragTransferItem(computed(() => card.value?.$el as HTMLElement), props.pack.id, props.isSelected ? 'right' : 'left');

    function onDragStart(e: DragEvent) {
      // e.dataTransfer!.dropEffect = 'move';
      e.dataTransfer!.effectAllowed = 'move';
      if (props.pack.id !== 'vanilla') {
        context.emit('dragstart', e);
      }
      e.dataTransfer!.setDragImage(iconImage.value.$el, 0, 0);
    }
    function onDragEnd(e: DragEvent) {
      if (props.pack.id !== 'vanilla') {
        context.emit('dragend', e);
      }
    }
    function openContextMenu(e: MouseEvent) {
      if (props.pack.id === 'vanilla') {
        return;
      }
      const menuItems: ContextMenuItem[] = [{
        text: $t('resourcepack.showFile', { file: props.pack.path }),
        children: [],
        onClick: () => {
          showItemInDirectory(props.pack.path);
        },
        icon: 'folder',
      }];
      if (props.pack.resource && props.pack.resource.source.curseforge) {
        menuItems.push({
          text: $t('resourcepack.showInCurseforge', { name: props.pack.name }),
          children: [],
          onClick: () => {
            goProjectAndRoute(props.pack.resource!.source.curseforge!.projectId, 'texture-packs');
          },
          icon: '$vuetify.icons.curseforge',
        });
      } else {
        menuItems.push({
          text: $t('resourcepack.searchOnCurseforge', { name: props.pack.name }),
          children: [],
          onClick: () => {
            searchProjectAndRoute(props.pack.name, 'texture-packs');
          },
          icon: 'search',
        });
      }
      open(e.clientX, e.clientY, menuItems);
    }
    return {
      compatible,
      iconImage,
      onDragStart,
      onDragEnd,
      mcversion: minecraft,
      card,
      openContextMenu,
    };
  },
});
</script>

<style scoped=true>
.incompatible.draggable-card:hover {
  background-color: #e65100;
}
.draggable-card:hover {
  background-color: #388e3c;
}
.title {
  max-width: 100%;
  white-space: nowrap;
}
</style>
