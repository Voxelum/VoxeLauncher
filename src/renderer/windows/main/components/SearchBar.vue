<template>
  <transition name="scale-transition">
    <v-text-field
      v-if="show"
      ref="self"
      v-model="text"
      style="position: fixed; z-index: 300;"
      :style="{ top: `${top}px`, right: `${right}px` }"
      solo
      append-icon="filter_list"
      @focus="focused = true"
      @blur="focused = false"
    />
  </transition>
</template>

<script lang=ts>
import { defineComponent, inject, ref, Ref, nextTick, watch } from '@vue/composition-api';
import { useSearch, useSearchToggle } from '../hooks';

export default defineComponent({
  setup() {
    const show = ref(false);
    const { text } = useSearch();
    const top = inject('search-top', ref(30));
    const right = inject('search-right', ref(30));
    const focused = ref(false);
    const self: Ref<any> = ref(null);
    function toggleBar(force?: boolean) {
      if (force) {
        if (show.value) {
          show.value = false;
          return true;
        } 
        return false;
      }
      if (show.value && !focused.value) {
        nextTick(() => {
          self.value?.focus();
        });
        return true;
      } 
      show.value = !show.value;
      nextTick(() => {
        self.value?.focus();
      });
      return true;
    }
    useSearchToggle(toggleBar);
    return {
      show,
      focused,
      self,
      text,
      top,
      right,
    };
  },
});
</script>

<style>
</style>
