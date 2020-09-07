<template>
  <v-card 
    v-draggable-card
    color="grey darken-3 draggable-card"
    hover
    dark
    draggable
    @click="$emit('click', $event)" 
    @dragstart="onDragStart" 
  >
    <v-img
      class="white--text favicon grey darken-2"
      height="100px"
      :src="favicon || ''"
    >
      <v-container fill-height fluid>
        <v-layout fill-height row wrap>
          <v-flex xs12 align-end flexbox>
            <v-icon left>
              {{ instance.server ? 'storage' : 'layers' }}
            </v-icon>
            <span class="headline">
              {{ instance.name || `Minecraft ${instance.runtime.minecraft}` }}
            </span>
          </v-flex>
          <v-flex v-if="instance.server" xs12 align-end flexbox>
            <v-chip color="green" label small style="">
              {{ instance.server.host }}:{{ instance.server.port }}
            </v-chip>
          </v-flex>
        </v-layout>
      </v-container>
    </v-img>
            
    <v-card-text v-if="description" class="font-weight-bold">
      <text-component :source="typeof description === 'object' ? description : {text: description}" />
    </v-card-text>

    <v-card-actions style="">
      <v-list-tile class="grow">
        <v-list-tile-content style="overflow-x: auto; max-width: 275px; white-space: nowrap; display: block;">
          <v-chip v-if="instance.server" small label :selected="false" @click.stop>
            <v-avatar>
              <v-icon :style="{ color: ping < 100 ? 'green' : ping < 300 ? 'orange' : 'red' }">
                signal_cellular_alt
              </v-icon>
            </v-avatar>
            {{ ping }} ms  
          </v-chip>
          <v-chip v-if="instance.server" small label :selected="false" @click.stop>
            <v-avatar>
              <v-icon>people</v-icon>
            </v-avatar>
            {{ players.online }} / {{ players.max }} 
          </v-chip>
          <v-chip label small :selected="false" @click.stop>
            <v-avatar>
              <v-icon>power</v-icon>
            </v-avatar>
            {{ instance.runtime.minecraft }}
          </v-chip>
          <v-chip v-if="instance.server" small label :selected="false" @click.stop>
            {{ version.name }}  
          </v-chip>
          <v-chip v-if="!instance.server" small label :selected="false" @click.stop>
            <v-avatar>
              <v-icon>person</v-icon>
            </v-avatar>
            {{ instance.author }}
          </v-chip>
        </v-list-tile-content>
      </v-list-tile>
    </v-card-actions>
  </v-card>
</template>
<script lang=ts>
import { defineComponent, reactive, toRefs, computed } from '@vue/composition-api';
import { useInstanceServerStatus } from '@/hooks';
import { Instance } from '@universal/store/modules/instance';
import { required } from '@/util/props';

export default defineComponent({
  props: {
    instance: required<Instance>(Object),
  },
  setup(props, context) {
    function onDragStart(event: DragEvent) {
      event.dataTransfer!.effectAllowed = 'move';
    }
    return {
      ...useInstanceServerStatus(props.instance.path),
      description: computed(() => props.instance.description),
      onDragStart,
    };
  },
});
</script>

<style>
.favicon .v-image__image {
   filter: blur(10px);
}
</style>
