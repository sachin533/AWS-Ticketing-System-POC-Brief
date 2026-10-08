<template>
  <span :class="cls" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap">
    <span class="w-1.5 h-1.5 rounded-full" :class="dot"></span>{{ status }}
  </span>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({ status: { type: String, default: 'OPEN' } });

const MAP = {
  OPEN: ['bg-blue-100 text-blue-800', 'bg-blue-500'],
  IN_PROGRESS: ['bg-amber-100 text-amber-800', 'bg-amber-500'],
  RESOLVED: ['bg-emerald-100 text-emerald-800', 'bg-emerald-500'],
  CLOSED: ['bg-slate-200 text-slate-600', 'bg-slate-400'],
};
const cls = computed(() => (MAP[props.status] || MAP.OPEN)[0]);
const dot = computed(() => (MAP[props.status] || MAP.OPEN)[1]);
</script>
