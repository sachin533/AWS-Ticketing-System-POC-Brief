<template>
  <div>
    <!-- Content header (AdminLTE style: title + subtitle) -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <h2 class="text-xl font-bold text-slate-900">{{ mineOnly ? 'My Tickets' : 'Ticket Dashboard' }}</h2>
        <p class="text-sm text-slate-500">
          {{ mineOnly ? 'Tickets assigned to you or filed by you' : 'All tickets in the workspace' }}
          <span v-if="!loading">· {{ tickets.length }} shown</span>
        </p>
      </div>
      <router-link to="/tickets/new" class="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow">
        ＋ New ticket
      </router-link>
    </div>

    <!-- Stat small-boxes (real data, never hard-coded) -->
    <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
      <div v-for="s in stats" :key="s.label" class="rounded-xl text-white p-4 shadow flex items-center gap-3" :class="s.bg">
        <span class="text-3xl opacity-90">{{ s.icon }}</span>
        <span>
          <span class="block text-2xl font-bold leading-none">{{ s.value }}</span>
          <span class="text-xs opacity-90">{{ s.label }}</span>
        </span>
      </div>
    </div>

    <!-- Filter card -->
    <div class="bg-white rounded-xl shadow p-3 flex flex-wrap gap-2 mb-4">
      <input v-model="filters.search" @input="debouncedLoad" placeholder="Search title / description / ticket ID…"
             class="border border-slate-300 px-3 py-2 rounded-lg flex-1 min-w-[200px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <select v-model="filters.status" @change="load" class="border border-slate-300 px-2 py-2 rounded-lg text-sm bg-white">
        <option value="">All statuses</option>
        <option>OPEN</option><option>IN_PROGRESS</option><option>RESOLVED</option><option>CLOSED</option>
      </select>
      <select v-model="filters.priority" @change="load" class="border border-slate-300 px-2 py-2 rounded-lg text-sm bg-white">
        <option value="">All priorities</option>
        <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option>
      </select>
    </div>

    <p v-if="error" class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">{{ error }}</p>
    <div v-if="loading" class="bg-white rounded-xl shadow px-4 py-8 text-center text-slate-500 text-sm">
      <p class="animate-pulse">Loading tickets…{{ progress.pages ? ` (page ${progress.pages}, ${progress.loaded} so far)` : '' }}</p>
    </div>

    <!-- Professional table (desktop) -->
    <div v-if="!loading && tickets.length" class="bg-white rounded-xl shadow overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[900px]">
          <thead>
            <tr class="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50">
              <th class="px-4 py-3 font-semibold">Ticket</th>
              <th class="px-4 py-3 font-semibold">Customer</th>
              <th class="px-4 py-3 font-semibold">Category</th>
              <th class="px-4 py-3 font-semibold">Priority</th>
              <th class="px-4 py-3 font-semibold">Status</th>
              <th class="px-4 py-3 font-semibold">Assignee</th>
              <th class="px-4 py-3 font-semibold">Created</th>
              <th class="px-4 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tickets" :key="t.ticketId" class="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td class="px-4 py-3">
                <router-link :to="`/tickets/${t.ticketId}`" class="font-semibold text-blue-700 hover:underline line-clamp-1">{{ t.title }}</router-link>
                <p class="text-xs text-slate-400 font-mono">{{ shortId(t.ticketId) }}</p>
              </td>
              <td class="px-4 py-3 text-slate-600 max-w-[180px] truncate" :title="t.customerEmail">{{ t.customerEmail }}</td>
              <td class="px-4 py-3"><span class="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">{{ t.category || 'GENERAL' }}</span></td>
              <td class="px-4 py-3"><PriorityBadge :priority="t.priority" /></td>
              <td class="px-4 py-3"><StatusBadge :status="t.status" /></td>
              <td class="px-4 py-3 text-slate-600 max-w-[160px] truncate" :title="t.assignee || ''">{{ t.assignee || '—' }}</td>
              <td class="px-4 py-3 text-slate-500 whitespace-nowrap">{{ fmtDate(t.createdAt) }}</td>
              <td class="px-4 py-3 text-right">
                <router-link :to="`/tickets/${t.ticketId}`" class="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap">View →</router-link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="px-4 py-2.5 text-xs text-slate-400 border-t border-slate-100">
        Showing all {{ tickets.length }} ticket(s) across {{ progress.pages || 1 }} page(s). Status, priority and search filters are applied server-side on every page.
      </p>
    </div>

    <div v-if="!loading && !tickets.length" class="bg-white rounded-xl shadow px-4 py-12 text-center">
      <p class="text-4xl mb-2">🎫</p>
      <p class="font-semibold text-slate-700">No tickets found</p>
      <p class="text-sm text-slate-500 mb-4">Try clearing the search or filters.</p>
      <router-link to="/tickets/new" class="text-sm font-semibold text-blue-700 hover:underline">＋ Create the first ticket</router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../services/api';
import { fmtDate } from '../utils/date';
import StatusBadge from '../components/StatusBadge.vue';
import PriorityBadge from '../components/PriorityBadge.vue';

const route = useRoute();
const tickets = ref([]);
const loading = ref(false);
const error = ref('');
const progress = reactive({ pages: 0, loaded: 0 });
const filters = reactive({ search: '', status: '', priority: '' });
const mineOnly = computed(() => route.query.mine === 'true');
let timer;

const stats = computed(() => {
  const c = (s) => tickets.value.filter((t) => t.status === s).length;
  return [
    { label: 'Total Tickets', value: tickets.value.length, icon: '🎫', bg: 'bg-gradient-to-br from-slate-600 to-slate-800' },
    { label: 'Open', value: c('OPEN'), icon: '📥', bg: 'bg-gradient-to-br from-blue-500 to-blue-700' },
    { label: 'In Progress', value: c('IN_PROGRESS'), icon: '⏳', bg: 'bg-gradient-to-br from-amber-500 to-orange-600' },
    { label: 'Resolved / Closed', value: c('RESOLVED') + c('CLOSED'), icon: '✅', bg: 'bg-gradient-to-br from-emerald-500 to-emerald-700' },
  ];
});

function shortId(id) { return (id || '').slice(0, 8) + '…'; }
function debouncedLoad() { clearTimeout(timer); timer = setTimeout(load, 350); }

/**
 * Loads ALL pages: listAllTickets follows the backend `nextKey` cursor until
 * the scan is exhausted (same status/priority/search filters sent on every
 * page). Never hard-codes a ticket count; stops when the cursor is absent.
 */
async function load() {
  loading.value = true; error.value = '';
  progress.pages = 0; progress.loaded = 0;
  try {
    const q = { ...filters };
    if (mineOnly.value) q.mine = 'true';
    const data = await api.listAllTickets(q, (p) => {
      progress.pages = p.pages; progress.loaded = p.loaded;
    });
    tickets.value = data.tickets || [];
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}

watch(() => route.query.mine, load);
onMounted(load);
</script>
