import { defineStore } from 'pinia';
import { api } from '../api';
import type { Category, ImportHistory, Website } from '../types';

type ViewMode = 'all' | 'favorites' | 'recent';

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    token: localStorage.getItem('pdw_token') || '',
    user: null as null | { id: string; email: string },
    categories: [] as Category[],
    websites: [] as Website[],
    imports: [] as ImportHistory[],
    overview: null as null | Record<string, number>,
    activeCategoryId: '',
    activeView: 'all' as ViewMode,
    query: '',
    layout: localStorage.getItem('pdw_layout') || 'grid',
    loading: false
  }),
  getters: {
    authed: (state) => Boolean(state.token),
    activeTitle: (state) => {
      if (state.query.trim()) return '搜索结果';
      if (state.activeView === 'favorites') return '常用网址';
      if (state.activeView === 'recent') return '最近访问';
      return state.categories.find((cat) => cat.id === state.activeCategoryId)?.name ?? '全部入口';
    }
  },
  actions: {
    async login(email: string, password: string) {
      const { data } = await api.post('/auth/login', { email, password });
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('pdw_token', data.token);
    },
    logout() {
      this.token = '';
      this.user = null;
      localStorage.removeItem('pdw_token');
    },
    async bootstrap() {
      await Promise.all([this.fetchCategories(), this.fetchWebsites(), this.fetchOverview()]);
    },
    async fetchOverview() {
      const { data } = await api.get('/overview');
      this.overview = data;
    },
    async fetchCategories() {
      const { data } = await api.get('/categories');
      this.categories = data;
    },
    async fetchWebsites() {
      this.loading = true;
      try {
        const searching = Boolean(this.query.trim());
        const { data } = await api.get('/websites', {
          params: {
            q: this.query || undefined,
            categoryId: searching ? undefined : this.activeCategoryId || undefined,
            view: searching || this.activeView === 'all' ? undefined : this.activeView
          }
        });
        this.websites = data;
      } finally {
        this.loading = false;
      }
    },
    async fetchImports() {
      const { data } = await api.get('/imports');
      this.imports = data;
    },
    async setCategory(id: string) {
      this.activeView = 'all';
      this.activeCategoryId = id;
      await this.fetchWebsites();
    },
    async setView(view: ViewMode) {
      this.activeView = view;
      this.activeCategoryId = '';
      await this.fetchWebsites();
    },
    async toggleFavorite(site: Website) {
      if (site.favorite) await api.delete(`/websites/${site.id}/favorite`);
      else await api.post(`/websites/${site.id}/favorite`);
      await this.fetchWebsites();
      await this.fetchOverview();
    },
    async moveFavorite(index: number, direction: -1 | 1) {
      const target = index + direction;
      if (target < 0 || target >= this.websites.length) return;
      const next = [...this.websites];
      [next[index], next[target]] = [next[target], next[index]];
      this.websites = next;
      await api.patch('/favorites/order', { websiteIds: next.map((site) => site.id) });
      await this.fetchWebsites();
    },
    async visit(site: Website) {
      await api.post(`/websites/${site.id}/visit`);
      window.location.href = site.url;
    },
    async remove(site: Website) {
      await api.delete(`/websites/${site.id}`);
      await this.bootstrap();
    },
    async createWebsite(payload: { title?: string; url: string; description?: string; categoryId?: string; tags?: string[] }) {
      await api.post('/websites', payload);
      await this.bootstrap();
    },
    async updateWebsite(id: string, payload: { title?: string; url?: string; description?: string; categoryId?: string; tags?: string[] }) {
      await api.patch(`/websites/${id}`, payload);
      await this.bootstrap();
    },
    async importBookmarks(file: File) {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/bookmarks/import', form);
      await this.bootstrap();
      return data;
    },
    async rollbackImport(id: string) {
      await api.post(`/imports/${id}/rollback`);
      await this.bootstrap();
    },
    setLayout(layout: string) {
      this.layout = layout;
      localStorage.setItem('pdw_layout', layout);
    }
  }
});
