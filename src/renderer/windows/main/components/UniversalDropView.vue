<template>
  <v-dialog
    v-if="inside"
    :value="true"
    @dragover.prevent
  >
    <div
      class="absoluted"
      style="height: 100vh; width: 100%; display: flex"
      @drop="onDrop"
      @dragover.prevent
    >
      <v-container
        fill-height
        style="padding: 45px"
      >
        <v-fade-transition>
          <v-card
            style="height: 100%; width: 100%"
            :elevation="14"
          >
            <v-layout
              align-center
              justify-center
              row
              fill-height
            >
              <v-flex
                v-if="pending"
                style="text-align:center; user-select: none;"
              >
                <v-icon
                  :style="{ 'font-size' : `${50}px` }"
                  style="display: block"
                >save_alt</v-icon>
                <v-card-text
                  class="headline font-weight-bold"
                  style="font-size: 100px"
                >{{ $t('dropToImport') }}</v-card-text>

                <v-card-text class="font-weight-bold">
                  <v-icon>$vuetify.icons.forge</v-icon>
                  {{ $tc('mod.name', 0) }}
                  <v-icon>$vuetify.icons.fabric</v-icon>
                  Fabric
                  {{ $tc('mod.name', 0) }}
                  <v-icon>$vuetify.icons.zip</v-icon>
                  {{ $tc('resourcepack.name', 0) }}
                  <v-icon>$vuetify.icons.package</v-icon>
                  {{ $tc('save.name', 0) }}
                  <v-icon :size="16">$vuetify.icons.curseforge</v-icon>
                  {{ $tc('profile.modpack.name', 0) }}
                </v-card-text>
              </v-flex>
              <v-flex
                v-else
                style="display: flex; flex-direction: column; height: 100%;"
              >
                <v-card-text class="headline font-weight-bold">即将导入</v-card-text>
                <v-divider></v-divider>
                <v-list style="overflow: auto">
                  <file-list-tile
                    v-for="file in previews"
                    :key="file.name"
                    :value="file"
                    @remove="remove(file)"
                  />
                </v-list>
                <v-spacer />
                <v-divider></v-divider>
                <v-card-actions>
                  <v-btn large flat @click="cancel">{{ $t('cancel') }}</v-btn>
                  <v-spacer />
                  <v-btn large flat color="primary" @click="start">{{ $t('profile.import.start') }}</v-btn>
                </v-card-actions>
              </v-flex>
            </v-layout>
          </v-card>
        </v-fade-transition>
      </v-container>
    </div>
  </v-dialog>
</template>

<script lang=ts>
import { useResourceOperation } from '@/hooks';
import { required } from '@/util/props';
import { ParseFileResult } from '@main/service/ResourceService';
import { Resource } from '@main/util/resource';
import { defineComponent, computed, ref } from '@vue/composition-api';
import FileListTile from './UniversalDropViewFileListTile.vue';

export interface FilePreview extends ParseFileResult {
  name: string;
  size: number;
  enabled: boolean;
}

export default defineComponent({
  components: {
    FileListTile,
  },
  setup() {
    const pending = ref(true);
    const inside = ref(false);
    const previews = ref([] as FilePreview[]);
    const { importResource, parseFileAsResource } = useResourceOperation();
    async function onDrop(event: DragEvent) {
      const files = [] as Array<File>;
      const dataTransfer = event.dataTransfer!;
      if (dataTransfer.files.length > 0) {
        for (let i = 0; i < dataTransfer.files.length; i++) {
          const file = dataTransfer.files.item(i)!;
          if (previews.value.every(p => p.path !== file.path)) {
            files.push(file);
          }
        }
      }
      console.log(files);
      const result = await parseFileAsResource({ files: files.map(f => ({ path: f.path })) });
      for (let i = 0; i < result.length; i++) {
        const r = result[i];
        const f = files[i];
        previews.value.push({
          ...r,
          name: f.name,
          size: f.size,
          enabled: r.type !== 'unknown' && r.type !== 'directory',
        });
      }
      pending.value = false;
    }
    function remove(file: FilePreview) {
      previews.value = previews.value.filter((p) => p.path !== file.path);
    }
    function cancel() {
      pending.value = true;
      inside.value = false;
      previews.value = [];
    }
    function start() {

    }
    document.addEventListener('dragleave', (e) => {
      if ((e as any).fromElement === null && e.dataTransfer!.effectAllowed === 'all') {
        if (!pending.value || previews.value.length > 0) {
          pending.value = false;
        } else {
          cancel();
        }
      }
    });
    document.addEventListener('dragenter', (e) => {
      if ((e as any).fromElement === null && e.dataTransfer!.effectAllowed === 'all') {
        inside.value = true;
        pending.value = true;
      }
    });
    return {
      onDrop,
      inside,
      pending,
      previews,
      remove,
      cancel,
      start,
    };
  },
});
</script>
