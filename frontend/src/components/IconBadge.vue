<script setup lang="ts">
import {
  Bot,
  Clock3,
  Code2,
  CreditCard,
  Folder,
  Globe2,
  Heart,
  Inbox,
  Mail,
  MonitorPlay,
  Server,
  Sparkles,
  WalletCards
} from 'lucide-vue-next';

const props = defineProps<{ name?: string; color?: string; compact?: boolean }>();

const icons = { Sparkles, Server, CreditCard, Mail, Code2, MonitorPlay, Inbox, Globe2, WalletCards, Bot, Folder, Heart, Clock3 };
const icon = icons[(props.name || 'Folder') as keyof typeof icons] || Folder;
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-[3px] border border-white/10 bg-white/[.04]"
    :class="compact ? 'h-[18px] w-[18px]' : 'h-6 w-6'"
    :style="{ color: color || '#d6b25e' }"
  >
    <component :is="icon" :size="compact ? 11 : 13" />
  </span>
</template>
