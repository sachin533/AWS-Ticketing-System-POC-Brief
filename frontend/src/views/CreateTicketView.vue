<template>
  <div class="max-w-2xl mx-auto">
    <h2 class="text-xl font-bold text-slate-900">Create Ticket</h2>
    <p class="text-sm text-slate-500 mb-4">Describe the issue and our support team will pick it up.</p>
    <div class="bg-white rounded-xl shadow overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-100">
        <h3 class="font-semibold text-slate-800">Ticket details</h3>
      </div>
      <div class="px-6 py-5">
        <p v-if="error" class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{{ error }}</p>
        <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Title</label>
        <input v-model="form.title" placeholder="e.g. Cannot log in after password reset" class="border border-slate-300 w-full px-3 py-2 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Description</label>
        <textarea v-model="form.description" placeholder="Steps to reproduce, expected vs actual behavior…" rows="5" class="border border-slate-300 w-full px-3 py-2 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Priority</label>
            <select v-model="form.priority" class="border border-slate-300 w-full px-3 py-2 rounded-lg text-sm bg-white">
              <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Category</label>
            <select v-model="form.category" class="border border-slate-300 w-full px-3 py-2 rounded-lg text-sm bg-white">
              <option>GENERAL</option><option>BILLING</option><option>TECHNICAL</option><option>ACCOUNT</option><option>OTHER</option>
            </select>
          </div>
        </div>
        <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Attachment <span class="normal-case font-normal">(optional, max 5 MB)</span></label>
        <input type="file" @change="onFile" class="block text-sm mb-1 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200" />
        <p v-if="uploading" class="text-sm text-slate-500 animate-pulse">Uploading attachment…</p>
        <ul class="text-sm mb-3 text-slate-700">
          <li v-for="a in attachments" :key="a.key">📎 {{ a.fileName }}</li>
        </ul>
        <div class="flex items-center gap-3 pt-2 border-t border-slate-100">
          <button @click="submit" :disabled="saving" class="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-6 py-2 rounded-lg disabled:opacity-50 shadow">
            {{ saving ? 'Saving…' : 'Submit ticket' }}
          </button>
          <router-link to="/tickets" class="text-sm font-medium text-slate-500 hover:text-slate-700">Cancel</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../services/api';

const router = useRouter();
const form = reactive({ title: '', description: '', priority: 'MEDIUM', category: 'GENERAL' });
const attachments = ref([]);
const error = ref('');
const saving = ref(false);
const uploading = ref(false);
// Matches backend MAX_ATTACHMENT_BYTES default (5 MB). Server still enforces its own limit.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

async function onFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  // Use one content type for both the presigned URL request and the S3 PUT —
  // a mismatch fails S3 signature verification.
  const contentType = file.type || 'application/octet-stream';
  if (file.size > MAX_FILE_BYTES) {
    error.value = `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB).`;
    return;
  }
  uploading.value = true; error.value = '';
  try {
    // 1) Ask Lambda for a presigned PUT URL  2) PUT bytes directly to S3
    const { uploadUrl, key } = await api.presignedUrl(file.name, contentType);
    await api.uploadToS3(uploadUrl, file, contentType);
    attachments.value.push({ key, fileName: file.name, contentType, size: file.size });
  } catch (err) { error.value = err.message; }
  finally { uploading.value = false; }
}

async function submit() {
  saving.value = true; error.value = '';
  try {
    const { ticket } = await api.createTicket({ ...form, attachments: attachments.value });
    router.push(`/tickets/${ticket.ticketId}`);
  } catch (e) { error.value = e.message; }
  finally { saving.value = false; }
}
</script>
