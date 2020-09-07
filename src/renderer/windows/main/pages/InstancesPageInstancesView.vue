<template>
  <v-layout
    class="invisible-scroll"
    row
    wrap
    style="overflow: scroll; max-height: 85vh;"
    justify-start
    fill-height
  >
    <v-flex
      v-if="instancesByTime[0].length !== 0"
      style="color: grey"
      xs12
    >
      {{ $t('profile.today') }}
    </v-flex>
    <v-flex
      v-for="instance in instancesByTime[0]"
      :key="instance.path"
      xs6
      @dragstart="$emit('dragstart', instance)"
      @dragend="$emit('dragend')"
    >
      <preview-card
        :instance="instance"
        @click.stop="$emit('select', instance.path)"
      />
    </v-flex>
    <v-flex
      v-if="instancesByTime[1].length !== 0"
      style="color: grey"
      xs12
    >
      {{ $t('profile.threeDay') }}
    </v-flex>
    <v-flex
      v-for="instance in instancesByTime[1]"
      :key="instance.path"
      xs6
      @dragstart="$emit('dragstart', instance)"
      @dragend="$emit('dragend')"
    >
      <preview-card
        :instance="instance"
        @click.stop="$emit('select', instance.path)"
      />
    </v-flex>
    <v-flex
      v-if="instancesByTime[2].length !== 0"
      style="color: grey"
      xs12
    >
      {{ $t('profile.older') }}
    </v-flex>
    <v-flex
      v-for="instance in instancesByTime[2]"
      :key="instance.path"
      xs6
      @dragstart="$emit('dragstart', instance)"
      @dragend="$emit('dragend')"
    >
      <preview-card
        :instance="instance"
        @click.stop="$emit('select', instance.path)"
      />
    </v-flex>
  </v-layout>
</template>

<script lang=ts>
import { computed, defineComponent, Ref } from '@vue/composition-api';
import { Instance } from '@universal/store/modules/instance';
import { required } from '@/util/props';
import PreviewCard from './InstancesPagePreviewCard.vue';

export default defineComponent({
  props: { instances: required<Instance[]>(Array) },
  components: {
    PreviewCard,
  },
  setup(props) {
    const now = Date.now();
    const oneDay = 1000 * 60 * 60 * 24;
    const threeDays = oneDay * 3;
    const instancesByTime: Ref<Instance[][]> = computed(() => {
      const todayR = [];
      const threeR = [];
      const other = [];
      for (const p of props.instances) {
        const diff = now - p.lastAccessDate;
        if (diff <= oneDay) {
          todayR.push(p);
        } else if (diff <= threeDays) {
          threeR.push(p);
        } else {
          other.push(p);
        }
      }
      return [todayR, threeR, other];
    });
    return { instancesByTime };
  },
});
</script>
