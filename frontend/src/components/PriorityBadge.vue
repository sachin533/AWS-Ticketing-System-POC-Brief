<template>
  <span :class="cls" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap">
    {{ priority }}
  </span>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({ priority: { type: String, default: 'MEDIUM' } });

const MAP = {
  LOW: 'bg-slate-100 text-slate-600 border border-slate-200',
  MEDIUM: 'bg-sky-100 text-sky-800 border border-sky-200',
  HIGH: 'bg-orange-100 text-orange-800 border border-orange-200',
  URGENT: 'bg-red-100 text-red-800 border border-red-300',
};
const cls = computed(() => MAP[props.priority] || MAP.MEDIUM);
</script>
