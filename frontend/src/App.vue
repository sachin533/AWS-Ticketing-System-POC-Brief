<template>
  <!-- AdminLTE-inspired shell: dark fixed sidebar + top navbar + content area.
       Pure Tailwind (no Bootstrap). Auth/routing untouched. -->
  <div class="min-h-screen bg-slate-100 text-slate-900 lg:flex">
    <!-- Mobile sidebar backdrop -->
    <div v-if="sidebarOpen" @click="sidebarOpen = false" class="fixed inset-0 bg-black/50 z-30 lg:hidden"></div>

    <!-- ============ SIDEBAR ============ -->
    <aside
      :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
      class="fixed lg:sticky top-0 z-40 h-screen w-[250px] shrink-0 bg-slate-900 text-slate-200 flex flex-col transition-transform duration-300 ease-in-out"
    >
      <!-- Brand -->
      <router-link to="/tickets" class="flex items-center gap-2.5 px-4 h-16 border-b border-white/10 shrink-0">
        <span class="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow">T</span>
        <span class="leading-tight">
          <span class="block font-bold text-white text-[15px]">TicketDesk</span>
          <span class="block text-[11px] text-slate-400">Support Console</span>
        </span>
      </router-link>

      <!-- User panel -->
      <div v-if="user" class="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <span class="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-white">
          {{ (user.email || '?')[0].toUpperCase() }}
        </span>
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium text-white">{{ user.email }}</span>
          <span :class="user.role === 'Agent' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-sky-500/20 text-sky-300'"
                class="inline-block mt-0.5 text-[11px] font-semibold px-2 py-px rounded-full">{{ user.role }}</span>
        </span>
      </div>

      <!-- Menu -->
      <nav class="flex-1 overflow-y-auto px-2.5 py-3 text-sm">
        <p class="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Main navigation</p>
        <router-link v-for="item in nav" :key="item.to" :to="item.to"
          @click="sidebarOpen = false"
          class="flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5 transition-colors"
          :class="isActive(item)
            ? 'bg-white/10 text-white font-semibold'
            : 'text-slate-300 hover:bg-white/5 hover:text-white'">
          <span class="text-base w-5 text-center">{{ item.icon }}</span>{{ item.label }}
        </router-link>
      </nav>

      <!-- Sign out -->
      <div v-if="user" class="p-3 border-t border-white/10">
        <button @click="onLogout" class="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
          ⏻ Sign out
        </button>
      </div>
    </aside>

    <!-- ============ MAIN COLUMN ============ -->
    <div class="flex-1 min-w-0 flex flex-col min-h-screen">
      <!-- Top navbar -->
      <header class="sticky top-0 z-20 h-16 bg-white border-b border-slate-200 flex items-center gap-3 px-4 shadow-sm">
        <button @click="sidebarOpen = !sidebarOpen" class="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100" aria-label="Menu">
          <span class="block w-5 h-0.5 bg-slate-700 mb-1"></span>
          <span class="block w-5 h-0.5 bg-slate-700 mb-1"></span>
          <span class="block w-5 h-0.5 bg-slate-700"></span>
        </button>
        <div class="min-w-0">
          <h1 class="font-bold text-slate-900 leading-tight truncate">{{ pageTitle }}</h1>
          <p class="text-xs text-slate-500 truncate hidden sm:block">
            <router-link to="/tickets" class="hover:underline">Home</router-link>
            <span v-if="crumb"> / {{ crumb }}</span>
          </p>
        </div>
        <div class="ml-auto flex items-center gap-2 text-sm">
          <span v-if="user" class="hidden md:inline text-slate-600 truncate max-w-[220px]">{{ user.email }}</span>
          <span v-if="user" :class="user.role === 'Agent' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'"
                class="text-xs font-semibold px-2.5 py-1 rounded-full">{{ user.role }}</span>
        </div>
      </header>

      <!-- Content -->
      <main class="flex-1 p-4 lg:p-6 w-full max-w-7xl mx-auto">
        <router-view />
      </main>

      <footer class="px-6 py-3 text-xs text-slate-400 border-t border-slate-200 bg-white">
        TicketDesk · Serverless Ticketing System · {{ user?.role || 'Signed out' }}
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { currentUser, logout } from './services/auth';

const route = useRoute();
const sidebarOpen = ref(false);
// Re-evaluate on every navigation so the shell reflects sign-in/out without reload.
const user = computed(() => {
  void route.path;
  return currentUser();
});

const nav = [
  { to: '/tickets', label: 'Dashboard', icon: '▦' },
  { to: '/tickets?mine=true', label: 'My Tickets', icon: '🎫' },
  { to: '/tickets/new', label: 'Create Ticket', icon: '＋' },
];
const isActive = (item) => {
  if (item.to === '/tickets') return route.path === '/tickets' && !route.query.mine;
  if (item.to === '/tickets?mine=true') return route.path === '/tickets' && !!route.query.mine;
  return route.path === item.to;
};

const TITLES = { '/tickets': 'Dashboard', '/tickets/new': 'Create Ticket' };
const pageTitle = computed(() => {
  if (route.path.startsWith('/tickets/') && route.path !== '/tickets/new') return 'Ticket Details';
  return TITLES[route.path] || 'TicketDesk';
});
const crumb = computed(() => {
  if (route.path === '/tickets/new') return 'Create';
  if (route.path.startsWith('/tickets/') && route.path !== '/tickets/new') return 'Details';
  return route.path === '/tickets' ? 'Overview' : '';
});

function onLogout() { logout(); }
</script>
