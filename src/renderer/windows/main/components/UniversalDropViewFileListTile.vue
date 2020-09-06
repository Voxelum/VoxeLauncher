
<template>
  <v-list-tile
    color="red"
    @click="tryEnable"
  >
    <v-list-tile-avatar>
      <v-icon :size="30">{{ icon }}</v-icon>
    </v-list-tile-avatar>
    <v-list-tile-content>
      <v-list-tile-title :style="{ 'text-decoration': disabled ? 'line-through' : 'none' }">{{ value.name }}</v-list-tile-title>
      <v-list-tile-sub-title>
        <v-chip label style="height: 20px" outline>{{ value.fileType }}</v-chip>
        {{ value.size }} bytes
      </v-list-tile-sub-title>
    </v-list-tile-content>

    <v-list-tile-action @click.stop>
      <v-menu offset-y>
        <template v-slot:activator="{ on }">
          <v-chip label color="white" outline
                  style="cursor: pointer"
                  v-on="on"
          >
            {{ value.type }}
          </v-chip>
        </template>
        <v-list color="black">
          <v-list-tile
            v-for="(item, index) in options"
            :key="index"
            @click=""
          >
            <v-list-tile-title>{{ item.text }}</v-list-tile-title>
          </v-list-tile>
        </v-list>
      </v-menu>
    </v-list-tile-action>

    <v-list-tile-action>
      <v-checkbox
        v-model="value.enabled"
        style="justify-content: flex-end"
        :disabled="disabled"
        hidden-details
      />
    </v-list-tile-action>

    <v-list-tile-action>
      <v-btn icon>
        <v-icon color="red" @click="$emit('remove')">close</v-icon>
      </v-btn>
    </v-list-tile-action>
  </v-list-tile>
</template>

<script lang=ts>
import { required } from '@/util/props';
import { defineComponent, computed, ref } from '@vue/composition-api';
import { FilePreview } from './UniversalDropView.vue';

export default defineComponent({
  props: {
    value: required<FilePreview>(Object),
  },
  setup(props) {
    const disabled = computed(() => props.value.type === 'unknown' || props.value.type === 'directory');
    const iconMap: Record<string, string> = {
      forge: '$vuetify.icons.package',
      fabric: '$vuetify.icons.fabric',
      unknown: 'device_unknown',
      resourcepack: '$vuetify.icons.zip',
      modpack: '$vuetify.icons.curseforge',
      save: '$vuetify.icons.zip',
    };
    const options = [{
      text: 'Forge Mods',
      type: 'forge',
    }, {
      text: 'Fabric Mods',
      type: 'forge',
    }, {
      text: 'World',
      type: 'save',
    }, {
      text: 'Modpack',
      type: 'modpack',
    }];
    const icon = computed(() => iconMap[props.value.type] ?? 'device_unknown');
    const tryEnable = () => {
      if (!disabled.value) {
        props.value.enabled = !props.value.enabled;
      }
    };
    return { disabled, tryEnable, icon, options };
  },
});
</script>
