<template>
  <v-list-tile
    :key="source.id"
    :class="{
      grey: selected === source.id,
      'darken-1': selected === source.id,
      'elevation-2': selected === source.id
    }"
    ripple
    @click="select(source)"
  >
    <v-list-tile-avatar>
      <v-icon v-if="statuses[source.id] !== 'loading'">
        {{ statuses[source.id] === "remote" ? "cloud" : "folder" }}
      </v-icon>
      <v-progress-circular v-else :width="2" :size="24" indeterminate />
    </v-list-tile-avatar>

    <v-list-tile-title>{{ source.id }}</v-list-tile-title>
    <v-list-tile-sub-title v-if="showTime">
      {{
        source.releaseTime
      }}
    </v-list-tile-sub-title>

    <v-list-tile-action style="justify-content: flex-end;">
      <v-chip :color="source.type === 'release' ? 'primary' : ''" label dark>
        {{ source.type }}
      </v-chip>
    </v-list-tile-action>
  </v-list-tile>
</template>

<script lang=ts>
import { defineComponent } from '@vue/composition-api';
import VirtualList from 'vue-virtual-scroll-list';
import { MinecraftVersion } from '@xmcl/installer';
import { Status } from '@universal/entities/version';
import { required, withDefault } from '@/util/props';

export default defineComponent({
  components: { VirtualList },
  props: {
    showTime: withDefault(Boolean, () => true),
    source: required<MinecraftVersion>(Object),
    selected: required(String),
    select: required<(version: MinecraftVersion) => void>(Function),
    statuses: required<Record<string, Status>>(Object),
  },
});
</script>

<style>
</style>
