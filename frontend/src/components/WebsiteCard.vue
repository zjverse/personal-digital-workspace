<script setup lang="ts">
import { computed } from 'vue';
import { Copy, ExternalLink, Pencil, Trash2 } from 'lucide-vue-next';
import type { Website } from '../types';

const props = defineProps<{ site: Website; dense?: boolean }>();
const emit = defineEmits<{
  open: [Website];
  edit: [Website];
  remove: [Website];
}>();

const tags = computed(() => {
  try {
    return JSON.parse(props.site.tags || '[]').filter((tag: { name?: string }) => tag.name).slice(0, 4);
  } catch {
    return [];
  }
});

async function copy() {
  await navigator.clipboard.writeText(props.site.url);
}
</script>

<template>
  <article
    class="group soft-card relative overflow-hidden rounded-lg p-3 transition duration-300 hover:-translate-y-0.5 hover:border-aurum/40 hover:shadow-gold"
    :class="dense ? 'min-h-[68px]' : 'min-h-[86px]'"
  >
    <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aurum/50 to-transparent opacity-0 transition group-hover:opacity-100" />
    <div class="flex items-start gap-2">
      <div class="flex min-w-0 flex-1 items-start gap-2">
        <img :src="site.favicon" class="h-[18px] w-[18px] rounded bg-slate-950/50 p-px ring-1 ring-white/10" alt="" />
        <div class="min-w-0">
          <h3 class="line-clamp-1 text-[13px] font-semibold leading-4 text-slate-50">{{ site.title }}</h3>
          <p class="mt-0.5 truncate text-[10px] leading-3 text-slate-400">{{ site.domain }}</p>
        </div>
      </div>
    </div>

    <p v-if="!dense" class="mt-2 line-clamp-1 text-[11px] leading-4 text-slate-300/80">{{ site.description || '这个入口暂未添加描述。' }}</p>

    <div v-if="!dense" class="mt-2 flex flex-nowrap gap-1 overflow-hidden">
      <span
        v-for="tag in tags"
        :key="tag.id"
        class="shrink-0 rounded-full border border-white/10 bg-white/[.04] px-1.5 py-0.5 text-[10px] leading-3 text-slate-300"
      >
        {{ tag.name }}
      </span>
    </div>

    <div class="mt-2 flex items-center justify-between">
      <span class="rounded-full px-1.5 py-0.5 text-[10px] leading-3" :style="{ color: site.category_color || '#d6b25e', background: 'rgba(255,255,255,.045)' }">
        {{ site.category_name || '未分类' }}
      </span>
      <div class="flex items-center gap-0.5 opacity-70 transition group-hover:opacity-100">
        <button class="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white" title="复制链接" @click="copy">
          <Copy :size="12" />
        </button>
        <button class="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white" title="编辑" @click="emit('edit', site)">
          <Pencil :size="12" />
        </button>
        <button class="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-rose-300" title="删除" @click="emit('remove', site)">
          <Trash2 :size="12" />
        </button>
        <button class="rounded-md bg-aurum px-2 py-1 text-slate-950 transition hover:bg-[#e4c87d]" title="打开" @click="emit('open', site)">
          <ExternalLink :size="12" />
        </button>
      </div>
    </div>
  </article>
</template>
