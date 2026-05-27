import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: DashboardView },
    { path: '/admin', redirect: '/' },
    { path: '/login', redirect: '/' }
  ]
});

router.beforeEach((to) => {
  if (to.path === '/admin' || to.path === '/login') return '/';
});
