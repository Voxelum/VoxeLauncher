<template>
  <img :src="fabric" width="24">
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from '@vue/composition-api';
import fabric from '@/assets/fabric.png';

export default defineComponent({
  setup() { return { fabric }; },
});
</script>
