<template>
  <v-container grid-list-md fill-height style="z-index: 10; padding">
    <v-layout row wrap>
      <v-flex tag="h1" style="display: flex" class="white--text" xs12>
        <span class="headline">{{ name || id }}</span>
        <v-spacer />
        <v-menu>
          <template v-slot:activator="{ on }">
            <v-btn flat v-on="on"> Install To Storage </v-btn>
          </template>

          <v-list>
            <v-list-tile
              v-for="(item, index) in items"
              :key="index"
              @click=""
            >
              <v-list-tile-title>{{ item.title }}</v-list-tile-title>
            </v-list-tile>
          </v-list>
        </v-menu>
      </v-flex>
      <v-flex xs12>
        <v-layout fill-height row>
          <v-flex xs8>
            <v-tabs v-model="tab" dark slider-color="yellow">
              <v-tab>{{ $t('curseforge.project.description') }}</v-tab>
              <v-tab>{{ $t('curseforge.project.files') }}</v-tab>
              <v-tab>{{ $t('curseforge.project.images') }}</v-tab>
              <v-tab-item>
                <project-description :project="projectId" />
              </v-tab-item>
              <v-tab-item>
                <project-files :project="projectId" :type="type" />
              </v-tab-item>
              <v-tab-item>
                <v-card style="overflow: auto; max-width: 100%; max-height: 70vh; min-height: 70vh">
                  <v-container v-if="false" fill-height style="min-height: 65vh;">
                    <v-layout justify-center align-center fill-height>
                      <v-progress-circular indeterminate :size="100" />
                    </v-layout>
                  </v-container>
                  <v-container v-else fill-height grid-list-md>
                    <v-layout row wrap>
                      <v-flex v-for="(img, index) in attachments" :key="index" d-flex>
                        <v-card flat hover style="min-width: 100px;" @click="viewImage(img)">
                          <v-img :src="img.url" />
                          <v-card-title>{{ img.title }}</v-card-title>
                        </v-card>
                      </v-flex>
                    </v-layout>
                  </v-container>
                </v-card>
              </v-tab-item>
            </v-tabs>
          </v-flex>
          <v-flex xs4 fill-height>
            <v-layout column>
              <v-flex xs6>
                <v-card style="max-height: 214px; min-height: 214px;">
                  <v-card-title style="display: block">
                    <div style="font-weight: 500;">{{ $t('curseforge.createdDate') }}</div>
                    <div
                      style="color: grey; padding-left: 5px"
                    >
                      {{ new Date(createdDate).toLocaleString() }}
                    </div>
                    <div style="font-weight: 500;">{{ $t('curseforge.lastUpdate') }}</div>
                    <div
                      style="color: grey; padding-left: 5px"
                    >
                      {{ new Date(lastUpdate).toLocaleString() }}
                    </div>
                    <div style="font-weight: 500;">{{ $t('curseforge.totalDownloads') }}</div>
                    <div style="color: grey; padding-left: 5px">{{ totalDownload }}</div>
                  </v-card-title>
                  <v-card-text>
                    <!-- <div style="font-weight: 500;">{{ $t('curseforge.license') }}</div> -->
                    <!-- <p style="color: grey;">{{ license.trim() }}</p> -->
                  </v-card-text>
                </v-card>
              </v-flex>
              <v-flex xs6>
                <v-card style="max-height: 232px; min-height: 232px;">
                  <v-card-title
                    primary-title
                    style="font-weight: 500;"
                  >
                    {{ $t('curseforge.recentFiles') }}
                  </v-card-title>
                  <div style="max-height: 160px; min-height: 160px; overflow: auto">
                    <v-list>
                      <v-tooltip v-for="file in recentFiles" :key="file.id" top>
                        <template v-slot:activator="{ on }">
                          <v-list-tile
                            :v-ripple="getFileStatus(file) === 'remote'"
                            @click="install(file)"
                            v-on="on"
                          >
                            <v-list-tile-content>
                              <v-list-tile-title>{{ file.displayName }}</v-list-tile-title>
                              <v-list-tile-sub-title>{{ new Date(file.fileDate).toLocaleDateString() }}</v-list-tile-sub-title>
                            </v-list-tile-content>
                            <v-list-tile-action>
                              <v-icon
                                v-if="getFileStatus(file) !== 'downloading'"
                              >
                                {{ getFileStatus(file) === 'downloaded' ? 'dns' : 'cloud_download' }}
                              </v-icon>
                              <v-progress-circular v-else indeterminate :size="24" :width="2" />
                            </v-list-tile-action>
                          </v-list-tile>
                        </template>
                        {{ file.fileName }}
                      </v-tooltip>
                    </v-list>
                  </div>
                </v-card>
              </v-flex>
            </v-layout>
          </v-flex>
        </v-layout>
      </v-flex>
    </v-layout>
    <v-dialog v-model="viewingImage">
      <v-img :src="viewedImage" />
    </v-dialog>
  </v-container>
</template>

<script lang=ts>
import { defineComponent, reactive, toRefs, watch, computed } from '@vue/composition-api';
import { File } from '@xmcl/curseforge';
import {
  useCurseforgeProject,
  useCurseforgeInstall,
} from '@/hooks';
import ProjectDescription from './CurseforgeProjectPageDescription.vue';
import ProjectFiles from './CurseforgeProjectPageFiles.vue';

export default defineComponent({
  props: {
    type: {
      type: String,
      default: 'mc-mods',
    },
    id: {
      type: String,
      required: true,
      default: '',
    },
  },
  components: { ProjectDescription, ProjectFiles },
  setup(props) {
    const projectId = computed(() => Number.parseInt(props.id, 10));
    const project = useCurseforgeProject(projectId.value);
    const { install: installFile, getFileStatus } = useCurseforgeInstall(props.type as any, projectId.value);

    const data = reactive({
      tab: 0,
      viewingImage: false,
      viewedImage: '',
    });
    const dataRefs = toRefs(data);

    function viewImage(image: any) {
      data.viewingImage = true;
      data.viewedImage = image.url;
    }
    async function install(file: File) {
      if (getFileStatus(file) === 'downloaded') return;
      await installFile(file);
    }
    watch(dataRefs.tab, () => {
      switch (data.tab) {
        case 1:
          // projectFiles.refreshFiles();
          break;
        case 2:
          // projectImages.refreshImages();
          break;
        default:
      }
    });
    return {
      viewImage,
      install,
      getFileStatus,
      ...toRefs(data),
      ...project,
      projectId,
    };
  },
});
</script>

<style>
.v-image__image {
  background-repeat: no-repeat;
  background-position: center center;
}
</style>
