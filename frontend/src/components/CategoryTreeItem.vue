<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next';
import IconBadge from './IconBadge.vue';

export type CategoryTreeNode = {
  id: string;
  name: string;
  icon: string;
  color: string;
  deepCount: number;
  children: CategoryTreeNode[];
  [key: string]: unknown;
};

defineProps<{
  node: CategoryTreeNode;
  activeId: string;
  expanded: Set<string>;
  level?: number;
}>();

const emit = defineEmits<{
  select: [CategoryTreeNode];
  toggle: [CategoryTreeNode];
}>();
</script>

<template>
  <div>
    <div class="sidebar-item" :class="{ active: activeId === node.id }">
      <button
        class="tree-button"
        :class="{ active: activeId === node.id }"
        :style="{ paddingLeft: `${14 + (level ?? 0) * 18}px` }"
        @click="emit('select', node)"
      >
        <span class="tree-label">
          <span
            class="tree-toggle"
            :class="{ empty: !node.children.length }"
            @click.stop="emit('toggle', node)"
          >
            <ChevronRight 
              v-if="node.children.length" 
              :size="14" 
              class="transition-transform duration-300"
              :class="{ 'rotate-90': expanded.has(node.id) }" 
            />
          </span>
          <IconBadge :name="node.icon" :color="node.color" compact />
          <span class="truncate">{{ node.name }}</span>
        </span>
        <span class="tree-count">{{ node.deepCount }}</span>
      </button>
    </div>

    <div v-if="expanded.has(node.id)" class="space-y-0.5">
      <CategoryTreeItem
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :active-id="activeId"
        :expanded="expanded"
        :level="(level ?? 0) + 1"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
      />
    </div>
  </div>
</template>
