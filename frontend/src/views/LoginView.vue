<template>
  <div class="max-w-md mx-auto mt-10 lg:mt-20">
    <div class="bg-white rounded-2xl shadow-lg overflow-hidden">
      <div class="bg-slate-900 px-8 py-6 text-center">
        <span class="inline-flex w-12 h-12 rounded-xl bg-blue-600 items-center justify-center text-white font-bold text-2xl shadow mb-2">T</span>
        <h1 class="text-xl font-bold text-white">TicketDesk</h1>
        <p class="text-sm text-slate-400">Serverless support console</p>
      </div>
      <div class="px-8 py-6 text-center">
        <p class="text-slate-600 text-sm mb-5">Sign up / sign in via Cognito Hosted UI.</p>
        <p v-if="error" class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4 text-left">{{ error }}</p>
        <p v-if="busy" class="text-slate-500 text-sm mb-4 animate-pulse">Signing you in…</p>
        <button v-else @click="login" class="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-2.5 rounded-lg w-full shadow">
          Sign in / Sign up
        </button>

    <!-- Local-dev bypass: shown only while Cognito is not configured (placeholder .env values).
         Creates an unsigned dev JWT so the router guard passes; the local backend
         (backend/local-server.js) decodes its payload without verifying. Never shown in prod. -->
    <div v-if="isDevBypass" class="mt-6 border-t pt-4">
      <p class="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mb-3">Cognito not configured — dev mode only</p>
      <button @click="devLogin('Customer')" class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded w-full mb-2">
        Continue locally as Customer
      </button>
      <button @click="devLogin('Agent')" class="bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded w-full">
        Continue locally as Agent
      </button>
    </div>

    <p class="text-xs text-slate-500 mt-4">Customers file tickets. Agents triage them. Role = Cognito group (Agents vs Customers).</p>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { login, handleCallback } from '../services/auth';

const router = useRouter();
const busy = ref(false);
const error = ref('');

// Cognito's allowed callback URL is /login, so the authorization code
// returns here (not /callback). Exchange it for tokens, then continue.
onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (params.get('error')) {
    const err = params.get('error_description') || params.get('error');
    error.value = err === 'invalid_scope'
      ? 'Sign-in failed: Cognito rejected the requested scopes. In the AWS Console, open the User Pool → App clients → "Serverless Ticketing" → Allowed OAuth scopes, and enable email, openid and phone.'
      : `Sign-in failed: ${err}`;
    return;
  }
  if (!code) return;
  busy.value = true;
  try {
    await handleCallback(code);
    // Drop ?code= from the URL so a refresh won't replay the exchange
    window.history.replaceState({}, '', '/login');
    router.push('/tickets');
  } catch (e) {
    error.value = `Sign-in failed: ${e.message}`;
  } finally {
    busy.value = false;
  }
});

// Placeholder values from .env.example mean "not deployed yet"
const domain = import.meta.env.VITE_COGNITO_DOMAIN || '';
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID || '';
const isDevBypass =
  import.meta.env.DEV && (domain.includes('ACCOUNTID') || clientId.startsWith('xxx'));

function devLogin(role) {
  const enc = (o) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payload = {
    sub: role === 'Agent' ? 'local-agent' : 'local-customer',
    email: role === 'Agent' ? 'agent@local.dev' : 'customer@local.dev',
    'cognito:groups': role === 'Agent' ? ['Agents'] : [],
  };
  const token = `${enc({ alg: 'none', typ: 'JWT' })}.${enc(payload)}.dev`;
  localStorage.setItem('id_token', token);
  router.push('/tickets');
}
</script>
