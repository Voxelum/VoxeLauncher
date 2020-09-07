
<template>
  <v-list-tile
    class="universal-drop-tile"
    color="red"
    @click="tryEnable"
  >
    <v-list-tile-avatar>
      <v-icon :size="30">{{ icon }}</v-icon>
    </v-list-tile-avatar>
    <v-list-tile-content style="">
      <v-list-tile-title :style="{ 'text-decoration': disabled ? 'line-through' : 'none' }">{{ value.name }}</v-list-tile-title>
      <v-list-tile-sub-title>
        {{ value.size }} bytes
      </v-list-tile-sub-title>
    </v-list-tile-content>
    <!-- <v-list-tile-content style="flex-grow: 1">
      <v-text-field
        v-if="value.type === 'modpack'"
        :label="$t('profile.name')"
        :placeholder="value.name"
        hide-details
        solo
        style="margin-left: 20px; max-width: 100px; background: transparent;"
        @click.stop
      />
    </v-list-tile-content> -->

    <v-list-tile-action>
      <v-chip label outline color="white">
        {{ typeName }}
      </v-chip>
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
      <v-btn v-if="value.status === 'idle'" icon>
        <v-icon color="red" @click="$emit('remove')">close</v-icon>
      </v-btn>
      <v-progress-circular v-else-if="value.status === 'loading'" indeterminate />
      <v-icon v-else-if="value.status === 'saved'" color="green"> check </v-icon>
      <v-icon v-else> error_outline </v-icon>
    </v-list-tile-action>
  </v-list-tile>
</template>

<script lang=ts>
import { required } from '@/util/props';
import { defineComponent, computed, ref } from '@vue/composition-api';
import { useI18n } from '@/hooks';
import { FilePreview } from './UniversalDropView.vue';

const iconMap: Record<string, string> = {
  forge: '$vuetify.icons.package',
  fabric: '$vuetify.icons.fabric',
  unknown: 'device_unknown',
  resourcepack: '$vuetify.icons.zip',
  'curseforge-modpack': '$vuetify.icons.curseforge',
  modpack: '$vuetify.icons.package',
  save: '$vuetify.icons.zip',
};

export default defineComponent({
  props: {
    value: required<FilePreview>(Object),
  },
  setup(props) {
    const { $tc, $t } = useI18n();
    const disabled = computed(() => props.value.type === 'unknown' || props.value.type === 'directory'
      || props.value.status !== 'idle');
  
    const icon = computed(() => iconMap[props.value.type] ?? 'device_unknown');
    const tryEnable = () => {
      if (!disabled.value) {
        props.value.enabled = !props.value.enabled;
      }
    };
    const typeName = computed(() => {
      switch (props.value.type) {
        case 'forge': return 'Forge Mod';
        case 'fabric': return 'Fabric Mod';
        case 'resourcepack': return $tc('resourcepack.name', 0);
        case 'modpack': return $tc('profile.modpack.name', 0);
        case 'save': return $t('curseforge.worlds.name');
        case 'curseforge-modpack': return $t('curseforge.modpacks.name');
        default:
        case 'unknown': return $t('unknownResource');
      }
    });
    return { disabled, tryEnable, icon, typeName };
  },
});
</script>

<style>
.universal-drop-tile .v-input__slot {
  background: transparent;
  box-shadow: unset;
}
</style>
