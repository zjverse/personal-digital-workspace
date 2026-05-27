<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ArrowDown, ArrowUp, CheckSquare, DatabaseBackup, ExternalLink, Import, Search, Shield, Square, Star, X } from 'lucide-vue-next';
import CategoryTreeItem from '../components/CategoryTreeItem.vue';
import type { CategoryTreeNode } from '../components/CategoryTreeItem.vue';
import { useWorkspaceStore } from '../stores/workspace';
import type { Category, Website } from '../types';

const store = useWorkspaceStore();
const searchTimer = ref<number | undefined>();
const expanded = ref<Set<string>>(new Set());
const showImport = ref(false);
const file = ref<File | null>(null);
const importing = ref(false);
const importResult = ref<Record<string, number> | null>(null);
const selectedIds = ref<Set<string>>(new Set());
const openWarning = ref('');

type CategoryNode = Category & { children: CategoryNode[]; deepCount: number };
type WebsiteSection = { id: string; title: string; sites: Website[] };

const categoryTree = computed(() => {
  const map = new Map<string, CategoryNode>();
  for (const cat of store.categories) map.set(cat.id, { ...cat, children: [], deepCount: cat.website_count ?? 0 });
  const roots: CategoryNode[] = [];
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) map.get(node.parent_id)?.children.push(node);
    else roots.push(node);
  }
  const sortNodes = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'zh-CN'));
    nodes.forEach((node) => sortNodes(node.children));
  };
  const total = (node: CategoryNode): number => {
    node.deepCount = (node.website_count ?? 0) + node.children.reduce((sum, child) => sum + total(child), 0);
    return node.deepCount;
  };
  roots.forEach(total);
  sortNodes(roots);
  return roots.filter((node) => node.deepCount > 0 || node.name === '我的服务');
});

const defaultCategory = computed(() => categoryTree.value.find((cat) => cat.name === '我的服务') ?? categoryTree.value[0]);
const activeSubtitle = computed(() => {
  if (store.query.trim()) return `全局搜索全部网址，共 ${store.websites.length} 个结果`;
  if (store.activeView === 'favorites') return `这里显示你手动加入的高频入口，共 ${store.websites.length} 个入口`;
  return `按照书签文件目录与顺序展示，共 ${store.websites.length} 个入口`;
});

const activeNode = computed(() => {
  if (!store.activeCategoryId) return null;
  const visit = (nodes: CategoryNode[]): CategoryNode | null => {
    for (const node of nodes) {
      if (node.id === store.activeCategoryId) return node;
      const found = visit(node.children);
      if (found) return found;
    }
    return null;
  };
  return visit(categoryTree.value);
});

const websiteSections = computed<WebsiteSection[]>(() => {
  if (store.query.trim()) return [{ id: 'search', title: '搜索结果', sites: store.websites }];
  if (store.activeView === 'favorites') return [{ id: 'common', title: '常用网址', sites: store.websites }];

  const node = activeNode.value;
  if (!node) return [{ id: 'search', title: '搜索结果', sites: store.websites }];

  if (!node.children.length) return [{ id: node.id, title: node.name, sites: store.websites }];

  const sections: WebsiteSection[] = [];
  const byCategory = new Map<string, Website[]>();
  for (const site of store.websites) {
    const key = site.category_id ?? '';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)?.push(site);
  }

  const directSites = byCategory.get(node.id) ?? [];
  if (directSites.length) sections.push({ id: node.id, title: node.name, sites: directSites });

  const collectIds = (item: CategoryNode): string[] => [item.id, ...item.children.flatMap(collectIds)];
  for (const child of node.children) {
    const ids = new Set(collectIds(child));
    const sites = store.websites.filter((site) => site.category_id ? ids.has(site.category_id) : false);
    if (sites.length) sections.push({ id: child.id, title: child.name, sites });
  }

  return sections.length ? sections : [{ id: node.id, title: node.name, sites: store.websites }];
});
const selectedSites = computed(() => store.websites.filter((site) => selectedIds.value.has(site.id)));
const selectedCount = computed(() => selectedSites.value.length);

watch(
  () => store.query,
  () => {
    window.clearTimeout(searchTimer.value);
    searchTimer.value = window.setTimeout(() => store.fetchWebsites(), 220);
  }
);

watch(
  () => store.websites.map((site) => site.id).join('|'),
  () => {
    const visibleIds = new Set(store.websites.map((site) => site.id));
    selectedIds.value = new Set([...selectedIds.value].filter((id) => visibleIds.has(id)));
  }
);

onMounted(async () => {
  store.activeView = 'favorites';
  store.activeCategoryId = '';
  await store.bootstrap();
  if (!store.query && defaultCategory.value) {
    expanded.value.add(defaultCategory.value.id);
  }
  store.setLayout('grid');
});

async function openSite(site: Website) {
  await store.visit(site);
}

async function showCommon() {
  await store.setView('favorites');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function toggleCommon(site: Website) {
  await store.toggleFavorite(site);
}

async function moveCommon(index: number, direction: -1 | 1) {
  await store.moveFavorite(index, direction);
}

function toggleSelected(site: Website) {
  openWarning.value = '';
  const next = new Set(selectedIds.value);
  if (next.has(site.id)) next.delete(site.id);
  else next.add(site.id);
  selectedIds.value = next;
}

function clearSelected() {
  selectedIds.value = new Set();
  openWarning.value = '';
}

function openSelectedSites() {
  const sites = [...selectedSites.value];
  const blocked: Website[] = [];
  const batchId = Date.now();

  for (const [index, site] of sites.entries()) {
    const opened = window.open('about:blank', `pdw_batch_${batchId}_${index}`);
    if (!opened) {
      blocked.push(site);
      continue;
    }
    try {
      opened.opener = null;
      opened.location.href = site.url;
    } catch {
      blocked.push(site);
    }
  }

  if (blocked.length) {
    selectedIds.value = new Set(blocked.map((site) => site.id));
    openWarning.value = `浏览器拦截了 ${blocked.length} 个页面，请允许此网站打开弹窗后再点一次。`;
    return;
  }

  clearSelected();
}

function fallbackIcon(site: Website) {
  const label = (site.title || site.domain || '?').trim().slice(0, 1).toUpperCase();
  const colors = ['#d6b25e', '#5b8def', '#e85d75', '#36a489', '#8b6fe8', '#d97706', '#0ea5e9', '#64748b'];
  const index = [...(site.domain || site.title || 'pdw')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length;
  const safeLabel = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="${colors[index]}"/><text x="64" y="76" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="700" text-anchor="middle" fill="#fff">${safeLabel}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function replaceBrokenIcon(event: Event, site: Website) {
  const img = event.target as HTMLImageElement;
  img.src = fallbackIcon(site);
}

async function importFile() {
  if (!file.value || importing.value) return;
  importing.value = true;
  try {
    importResult.value = await store.importBookmarks(file.value);
    file.value = null;
    if (defaultCategory.value) {
      expanded.value.add(defaultCategory.value.id);
    }
    await store.setView('favorites');
  } finally {
    importing.value = false;
  }
}

function toggleNode(node: CategoryNode | CategoryTreeNode) {
  if (!node.children.length) return;
  const next = new Set(expanded.value);
  if (next.has(node.id)) next.delete(node.id);
  else next.add(node.id);
  expanded.value = next;
}

async function selectNode(node: CategoryNode | CategoryTreeNode) {
  if (node.children.length) {
    const next = new Set(expanded.value);
    next.add(node.id);
    expanded.value = next;
  }
  await store.setCategory(node.id);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
</script>

<template>
  <main class="workspace-page min-h-screen">
    <aside class="sidebar-shell">
      <div class="sidebar-brand">
        <div class="brand-mark">
          <Shield :size="16" />
        </div>
        <div class="min-w-0">
          <h1>PDW</h1>
          <p>Personal workspace</p>
        </div>
      </div>

      <div class="sidebar-search">
        <Search :size="14" />
        <input v-model="store.query" placeholder="搜索..." />
      </div>

      <div class="sidebar-tree custom-scrollbar">
        <button class="common-nav-button" :class="{ active: store.activeView === 'favorites' }" @click="showCommon">
          <span class="common-nav-label">
            <Star :size="14" :fill="store.activeView === 'favorites' ? 'currentColor' : 'none'" />
            常用网址
          </span>
          <span>{{ store.overview?.favorites ?? 0 }}</span>
        </button>

        <CategoryTreeItem
          v-for="node in categoryTree"
          :key="node.id"
          :node="node"
          :active-id="store.activeCategoryId"
          :expanded="expanded"
          @select="selectNode"
          @toggle="toggleNode"
        />
      </div>

      <div class="sidebar-actions">
        <button class="sidebar-action-button" @click="showImport = true">
          <Import :size="14" />
          导入书签
        </button>
      </div>
    </aside>

    <section class="content-shell">
      <header class="content-header">
        <div>
          <h2>{{ store.activeTitle }}</h2>
          <p>{{ activeSubtitle }}</p>
        </div>
        <div v-if="selectedCount" class="bulk-actions">
          <span>已选 {{ selectedCount }} 个</span>
          <button @click="openSelectedSites">
            <ExternalLink :size="13" />
            打开选中
          </button>
          <button class="muted" @click="clearSelected">
            <X :size="13" />
            清空
          </button>
          <span v-if="openWarning" class="bulk-warning">{{ openWarning }}</span>
        </div>
      </header>

      <div v-if="store.loading" class="site-grid">
        <div v-for="i in 18" :key="i" class="site-skeleton" />
      </div>

      <div v-else-if="store.websites.length" class="section-list">
        <section v-for="section in websiteSections" :key="section.id" class="bookmark-section">
          <h3>{{ section.title }}</h3>
          <div class="site-grid">
            <div
              v-for="(site, index) in section.sites"
              :key="site.id"
              class="nav-card group"
              :class="{ selected: selectedIds.has(site.id) }"
              :title="site.title"
            >
              <button
                class="select-toggle"
                :class="{ active: selectedIds.has(site.id) }"
                :title="selectedIds.has(site.id) ? '取消选择' : '选择网址'"
                @click.stop="toggleSelected(site)"
              >
                <CheckSquare v-if="selectedIds.has(site.id)" :size="14" />
                <Square v-else :size="14" />
              </button>
              <button class="site-main" @click="openSite(site)">
                <span class="site-icon">
                  <img :src="site.favicon || fallbackIcon(site)" alt="" @error="replaceBrokenIcon($event, site)" />
                </span>
                <span class="site-copy">
                  <span class="site-title">{{ site.title }}</span>
                  <span class="site-category">{{ site.category_name || '未分类' }}</span>
                </span>
              </button>
              <button
                class="common-toggle"
                :class="{ active: site.favorite }"
                :title="site.favorite ? '移出常用网址' : '加入常用网址'"
                @click.stop="toggleCommon(site)"
              >
                <Star :size="13" :fill="site.favorite ? 'currentColor' : 'none'" />
              </button>
              <span v-if="store.activeView === 'favorites' && !store.query.trim() && section.sites.length > 1" class="common-order">
                <button title="上移" :disabled="index === 0" @click.stop="moveCommon(index, -1)">
                  <ArrowUp :size="12" />
                </button>
                <button title="下移" :disabled="index === section.sites.length - 1" @click.stop="moveCommon(index, 1)">
                  <ArrowDown :size="12" />
                </button>
              </span>
            </div>
          </div>
        </section>
      </div>

      <div v-else class="empty-state">
        <p>{{ store.query.trim() ? '没有搜索结果' : store.activeView === 'favorites' ? '还没有常用网址' : '没有匹配的网站' }}</p>
        <span>{{ store.query.trim() ? '换一个关键词试试。' : store.activeView === 'favorites' ? '进入任意目录，把经常打开的入口加入这里。' : '可以清空搜索，或使用导入按钮重新导入书签。' }}</span>
      </div>
    </section>

    <div v-if="showImport" class="modal-backdrop">
      <form class="import-modal" @submit.prevent="importFile">
        <div class="modal-header">
          <div>
            <h3>导入书签</h3>
            <p>严格按照 HTML / JSON 书签文件中的目录和顺序重建展示数据。</p>
          </div>
          <button type="button" class="modal-close" @click="showImport = false">
            <X :size="18" />
          </button>
        </div>

        <label class="file-picker">
          <DatabaseBackup :size="28" />
          <span>{{ file?.name || '选择 bookmarks.html / bookmarks.json' }}</span>
          <input type="file" class="hidden" accept=".json,.html,.htm" @change="file = ($event.target as HTMLInputElement).files?.[0] || null" />
        </label>

        <div v-if="importResult" class="import-result">
          <div v-for="(value, key) in importResult" :key="key">
            <p>{{ key }}</p>
            <strong>{{ value }}</strong>
          </div>
        </div>

        <button class="modal-submit" :disabled="!file || importing">{{ importing ? '导入中...' : '一次性导入全部书签' }}</button>
      </form>
    </div>
  </main>
</template>
