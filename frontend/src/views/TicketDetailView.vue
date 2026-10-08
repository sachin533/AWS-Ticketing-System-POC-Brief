<template>
  <div v-if="ticket" class="max-w-4xl mx-auto">
    <router-link to="/tickets" class="text-sm font-medium text-blue-700 hover:underline">← Back to tickets</router-link>

    <!-- Ticket information card -->
    <div class="bg-white rounded-xl shadow mt-3 overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-xl font-bold text-slate-900">{{ ticket.title }}</h1>
          <p class="text-xs text-slate-400 font-mono mt-1">{{ ticket.ticketId }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <StatusBadge :status="ticket.status" />
          <PriorityBadge :priority="ticket.priority" />
        </div>
      </div>
      <p class="px-6 py-4 text-slate-700 whitespace-pre-wrap leading-relaxed">{{ ticket.description }}</p>
      <dl class="grid grid-cols-2 md:grid-cols-3 gap-px bg-slate-100 border-t border-slate-100 text-sm">
        <div v-for="f in metaFields" :key="f.label" class="bg-white px-6 py-3">
          <dt class="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{{ f.label }}</dt>
          <dd class="font-medium text-slate-800 truncate" :title="f.value">{{ f.value }}</dd>
        </div>
      </dl>
      <div v-if="ticket.attachments?.length" class="px-6 py-4 border-t border-slate-100 text-sm">
        <h3 class="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Attachments ({{ ticket.attachments.length }})</h3>
        <div v-for="a in ticket.attachments" :key="a.key" class="mb-1">
          <a v-if="a.downloadUrl" :href="a.downloadUrl" target="_blank" class="text-blue-700 hover:underline">📎 {{ a.fileName }}</a>
          <span v-else class="text-slate-600">📎 {{ a.fileName }}</span>
        </div>
      </div>

      <!-- Agent controls (also enforced server-side in Lambda) -->
      <div v-if="user?.role === 'Agent'" class="px-6 py-4 border-t border-slate-100 bg-slate-50">
        <h3 class="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Agent controls</h3>
        <div class="flex flex-wrap gap-2">
          <select v-model="edit.status" class="border border-slate-300 px-2 py-1.5 rounded-lg text-sm bg-white">
            <option>OPEN</option><option>IN_PROGRESS</option><option>RESOLVED</option><option>CLOSED</option>
          </select>
          <input v-model="edit.assignee" placeholder="assignee@email.com" class="border border-slate-300 px-2 py-1.5 rounded-lg text-sm min-w-[200px]" />
          <select v-model="edit.priority" class="border border-slate-300 px-2 py-1.5 rounded-lg text-sm bg-white">
            <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option>
          </select>
          <select v-model="edit.category" class="border border-slate-300 px-2 py-1.5 rounded-lg text-sm bg-white">
            <option>GENERAL</option><option>BILLING</option><option>TECHNICAL</option><option>ACCOUNT</option><option>OTHER</option>
          </select>
          <button @click="save" class="bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">Update</button>
        </div>
      </div>
      <p v-if="error" class="px-6 py-2 text-red-600 text-sm bg-red-50">{{ error }}</p>
    </div>

    <!-- Activity timeline + comments -->
    <div class="bg-white rounded-xl shadow mt-4 overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-100">
        <h2 class="font-bold text-slate-900">Activity timeline <span class="text-sm font-normal text-slate-400">({{ comments.length }} comments)</span></h2>
      </div>
      <div class="px-6 py-4">
        <div v-if="!comments.length" class="text-sm text-slate-400 py-2">No comments yet — start the conversation below.</div>
        <ol class="relative border-l-2 border-slate-100 ml-1.5 space-y-4">
          <li v-for="c in comments" :key="c.commentId" class="ml-5">
            <span class="absolute -left-[7px] mt-1 w-3 h-3 rounded-full" :class="c.authorRole === 'Agent' ? 'bg-emerald-500' : 'bg-blue-500'"></span>
            <p class="text-sm">
              <span class="font-semibold text-slate-800">{{ c.authorEmail }}</span>
              <span class="ml-2 text-[11px] font-semibold px-1.5 py-px rounded" :class="c.authorRole === 'Agent' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'">{{ c.authorRole }}</span>
            </p>
            <p class="text-sm text-slate-700 whitespace-pre-wrap mt-0.5">{{ c.message }}</p>
            <p class="text-xs text-slate-400 mt-0.5">{{ fmtDateTime(c.createdAt) }}</p>
          </li>
        </ol>
        <div class="flex gap-2 mt-4">
          <input v-model="newComment" @keyup.enter="post" placeholder="Write a comment…" class="border border-slate-300 flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button @click="post" class="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 rounded-lg">Post</button>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="max-w-md mx-auto mt-16 bg-white rounded-xl shadow px-6 py-10 text-center">
    <p class="text-slate-500">{{ error || 'Loading ticket…' }}</p>
    <router-link to="/tickets" class="text-sm font-semibold text-blue-700 hover:underline mt-2 inline-block">← Back to tickets</router-link>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api } from '../services/api';
import { currentUser } from '../services/auth';
import { fmtDateTime } from '../utils/date';
import StatusBadge from '../components/StatusBadge.vue';
import PriorityBadge from '../components/PriorityBadge.vue';

const props = defineProps({ id: String });
const ticket = ref(null);
const comments = ref([]);
const error = ref('');
const newComment = ref('');
const edit = reactive({ status: 'OPEN', assignee: '', priority: 'MEDIUM', category: 'GENERAL' });
const user = currentUser();

const metaFields = computed(() => ticket.value ? [
  { label: 'Category', value: ticket.value.category || 'GENERAL' },
  { label: 'Customer', value: ticket.value.customerEmail || '—' },
  { label: 'Assignee', value: ticket.value.assignee || 'Unassigned' },
  { label: 'Created', value: fmtDateTime(ticket.value.createdAt) },
  { label: 'Updated', value: fmtDateTime(ticket.value.updatedAt) },
  { label: 'Ticket ID', value: (ticket.value.ticketId || '').slice(0, 13) + '…' },
] : []);

async function load() {
  try {
    const t = await api.getTicket(props.id);
    ticket.value = t.ticket;
    Object.assign(edit, { status: t.ticket.status, assignee: t.ticket.assignee || '', priority: t.ticket.priority, category: t.ticket.category || 'GENERAL' });
    const c = await api.listComments(props.id);
    comments.value = c.comments || [];
  } catch (e) { error.value = e.message; }
}

async function save() {
  error.value = '';
  try {
    const { ticket: t } = await api.updateTicket(props.id, { ...edit, assignee: edit.assignee || null });
    ticket.value = t;
  } catch (e) { error.value = e.message; }
}

async function post() {
  if (!newComment.value.trim()) return;
  try {
    const { comment } = await api.addComment(props.id, newComment.value.trim());
    comments.value.push(comment);
    newComment.value = '';
  } catch (e) { error.value = e.message; }
}

onMounted(load);
</script>
