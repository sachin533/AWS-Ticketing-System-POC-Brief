import { createRouter, createWebHistory } from 'vue-router';
import { isAuthenticated, isAgent } from '../services/auth';
import LoginView from '../views/LoginView.vue';
import CallbackView from '../views/CallbackView.vue';
import DashboardView from '../views/DashboardView.vue';
import CreateTicketView from '../views/CreateTicketView.vue';
import TicketDetailView from '../views/TicketDetailView.vue';

const routes = [
  { path: '/', redirect: '/tickets' },
  { path: '/login', component: LoginView },
  { path: '/callback', component: CallbackView },
  { path: '/tickets', component: DashboardView, meta: { requiresAuth: true } },
  { path: '/tickets/new', component: CreateTicketView, meta: { requiresAuth: true } },
  { path: '/tickets/:id', component: TicketDetailView, meta: { requiresAuth: true }, props: true },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isAuthenticated()) return '/login';
  if (to.meta.requiresAgent && !isAgent()) return '/tickets';
});

export default router;
