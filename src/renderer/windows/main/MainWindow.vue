<template>
  <v-app
    ref="app"
    dark
    style="background: transparent;"
  >
    <universal-drop-view />
    <v-container
      v-if="loading"
      color="primary"
      align-center
      justify-center
      class="loading-background"
      style="position: absolute; width: 100%; height: 100%;"
    />
    <v-layout
      v-else
      fill-height
    >
      <side-bar />
      <v-layout
        style="padding: 0; background: transparent; max-height: 100vh;"
        fill-height
      >
        <div
          class="main-body v-sheet"
          :class="{ solid: !blurMainBody }"
        >
          <img
            v-if="backgroundImage"
            :src="`file:///${backgroundImage}`"
            :style="{ filter: `blur:${blur}px` }"
            style="z-index: -0; filter: blur(4px); position: absolute; width: 100%; height: 100%;"
          />
          <vue-particles
            v-if="showParticle"
            color="#dedede"
            :style="{ 'pointer-events': onHomePage ? 'auto' : 'none' }"
            style="position: absolute; width: 100%; height: 100%; z-index: 0; tabindex = -1;"
            :click-mode="particleMode"
          />
          <transition
            name="fade-transition"
            mode="out-in"
          >
            <!-- <keep-alive> -->
            <router-view />
            <!-- </keep-alive> -->
          </transition>
        </div>
      </v-layout>
      <context-menu />
      <search-bar />
      <notifier />
      <login-dialog />
      <task-dialog />
      <launch-status-dialog />
      <java-wizard-dialog />
    </v-layout>
  </v-app>
</template>

<script lang=ts>
import '@/assets/common.css';

import {
  onMounted,
  reactive,
  toRefs,
  watch,
  defineComponent,
  ref,
  provide,
  Ref,
} from '@vue/composition-api';
import {
  useParticle,
  useBackgroundImage,
  useIpc,
  useRouter,
  useStore,
  useBackgroundBlur,
} from '@/hooks';
import { provideTasks } from '@/providers/provideTaskProxy';
import { provideDialog, provideNotifier, provideContextMenu, provideSearch, provideAsyncRoute } from './hooks';
import LoginDialog from './dialog/BaseLoginDialog.vue';
import TaskDialog from './dialog/BaseTaskDialog.vue';
import LaunchStatusDialog from './dialog/BaseLaunchStatusDialog.vue';
import JavaWizardDialog from './dialog/BaseJavaWizardDialog.vue';

export default defineComponent({
  components: { LoginDialog, TaskDialog, LaunchStatusDialog, JavaWizardDialog },
  setup() {
    provideDialog();
    provideNotifier();
    provideTasks();
    provideAsyncRoute();

    const { text, toggle } = provideSearch();
    provideContextMenu();

    const ipcRenderer = useIpc();
    const { particleMode, showParticle } = useParticle();
    const { blurMainBody } = useBackgroundBlur();
    const { blur, backgroundImage } = useBackgroundImage();
    const { state } = useStore();
    const router = useRouter();
    const onHomePage = ref(router.currentRoute.path === '/');
    const app: Ref<Vue | null> = ref(null);

    router.afterEach((to) => {
      onHomePage.value = to.path === '/';
      toggle(true);
      text.value = '';
    });

    const data = reactive({
      loading: true,
      over: false,
    });

    function refreshImage() {
      const img = backgroundImage;
    }

    onMounted(() => {
      ipcRenderer.once('synced', () => {
        data.loading = false;
      });
      watch(backgroundImage, () => {
        refreshImage();
      });
      watch(particleMode, () => {
        if (showParticle.value) {
          showParticle.value = false;
          setImmediate(() => {
            showParticle.value = true;
          });
        }
      });
      app.value!.$el.classList.add(state.platform);
    });

    return {
      ...toRefs(data),
      app,
      blur,
      backgroundImage,
      blurMainBody,
      particleMode,
      showParticle,
      onHomePage,
    };
  },
});
</script>

<style>
.clip-head {
  clip-path: inset(0px 30px 30px 0px) !important;
  width: 64px;
  height: auto; /*to preserve the aspect ratio of the image*/
}
.v-input__icon--prepend {
  margin-right: 7px;
}
img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>

<style scoped=true>
.main-body {
  max-width: 720px;
  width: 100%;
  border-radius: 0px 2px 2px 0;
}
</style>
