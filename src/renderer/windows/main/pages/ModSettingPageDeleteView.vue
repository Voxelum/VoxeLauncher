<template>
  <v-card>
    <v-card-title primary-title>
      <div style="margin-bottom: 20px">
        <h3 class="headline mb-0">{{ $t('mod.deletion') }}</h3>
      </div>
      <div
        style="overflow: hidden; word-break: break-all;"
      >
        {{ $tc('mod.deletionHint', mods.length) }}
      </div>
      <ol style="margin-top: 5px">
        <li v-for="mod in mods" 
            :key="mod">
          <span style="overflow: hidden; word-break: break-all; font-weight: bold; "> {{ mod }} </span>
        </li>
        <li v-if="rest > 0" style="overflow: hidden; word-break: break-all; font-style: italic; ">
          {{ $t('mod.deletionRestHint', { rest }) }}
        </li>
      </ol>
    </v-card-title>

    <v-divider />
    <v-card-actions>
      <v-btn
        flat
        @click="cancel"
      >
        {{ $t('no') }}
      </v-btn>
      <v-spacer />
      <v-btn
        flat
        color="red"
        @click="confirm"
      >
        <v-icon left>delete</v-icon>
        {{ $t('delete.yes') }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script lang=ts>
import { computed, defineComponent } from '@vue/composition-api';
import { required } from '@/util/props';
import { ModItem } from '@/hooks';

export default defineComponent({
  props: {
    confirm: required<() => void>(Function),
    cancel: required<() => void>(Function),
    items: required<ModItem[]>(Array),
  },
  setup(props) {
    return { 
      mods: computed(() => props.items.map((i) => `${i.name} v${i.version}`).filter((_, i) => i <= 4)),
      rest: computed(() => (props.items.length > 4 ? props.items.length - 4 : 0)),
    };
  },
});
</script>

<style>
.card-list.right {
  display: flex;
  flex-flow: column;
}
</style>
