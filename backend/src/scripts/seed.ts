import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { db, migrate, row } from '../db.js';
import { importBookmarks } from '../services/bookmarks.js';
import { domainOf, faviconFor, hashUrl, id, normalizeUrl, now } from '../utils.js';

migrate();

const adminId = 'owner-admin';
const hash = await bcrypt.hash(config.adminPassword, 10);
db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)').run(
  adminId,
  config.adminEmail,
  hash,
  'Workspace Owner',
  'admin'
);

const defaults = [
  { name: 'AI工具', icon: 'Sparkles', color: '#d6b25e' },
  { name: 'VPS与代理', icon: 'Server', color: '#60a5fa' },
  { name: '支付与银行卡', icon: 'CreditCard', color: '#d6b25e' },
  { name: '邮箱与账号', icon: 'Mail', color: '#a78bfa' },
  { name: '开发工具', icon: 'Code2', color: '#22d3ee' },
  { name: '常用网站', icon: 'Globe2', color: '#cbd5e1' },
  { name: '数字资产入口', icon: 'WalletCards', color: '#f59e0b' },
  { name: '待整理', icon: 'Inbox', color: '#64748b' }
];

for (const [index, cat] of defaults.entries()) {
  db.prepare('INSERT OR IGNORE INTO categories (id, name, icon, color, sort_order, is_system) VALUES (?, ?, ?, ?, ?, ?)').run(
    `cat-${cat.name}`,
    cat.name,
    cat.icon,
    cat.color,
    index + 1,
    cat.name === '待整理' ? 1 : 0
  );
}

const demo = [
  ['AI工具', 'ChatGPT', 'https://chat.openai.com/'],
  ['AI工具', 'Claude', 'https://claude.ai/'],
  ['AI工具', 'Gemini', 'https://gemini.google.com/'],
  ['AI工具', 'Cursor', 'https://cursor.com/'],
  ['AI工具', 'Midjourney', 'https://www.midjourney.com/'],
  ['VPS与代理', 'Cloudflare', 'https://dash.cloudflare.com/'],
  ['VPS与代理', 'RackNerd', 'https://my.racknerd.com/'],
  ['VPS与代理', 'Vultr', 'https://www.vultr.com/'],
  ['VPS与代理', 'Clash Verge', 'https://github.com/clash-verge-rev/clash-verge-rev'],
  ['VPS与代理', 'Shadowrocket', 'https://apps.apple.com/us/app/shadowrocket/id932747118'],
  ['VPS与代理', 'v2rayNG', 'https://github.com/2dust/v2rayNG'],
  ['VPS与代理', '711Proxy', 'https://www.711proxy.com/'],
  ['VPS与代理', 'VIRCS', 'https://www.vircs.com/'],
  ['支付与银行卡', 'Wise', 'https://wise.com/'],
  ['支付与银行卡', 'Bybit', 'https://www.bybit.com/'],
  ['支付与银行卡', 'SafePal', 'https://www.safepal.com/'],
  ['支付与银行卡', 'Fiat24', 'https://www.fiat24.com/'],
  ['支付与银行卡', 'Supay', 'https://www.supay.com/'],
  ['邮箱与账号', 'Gmail', 'https://mail.google.com/'],
  ['邮箱与账号', 'Outlook', 'https://outlook.live.com/'],
  ['邮箱与账号', 'Proton Mail', 'https://proton.me/mail'],
  ['邮箱与账号', 'TikTok', 'https://www.tiktok.com/'],
  ['邮箱与账号', 'Apple ID', 'https://appleid.apple.com/'],
  ['开发工具', 'GitHub', 'https://github.com/'],
  ['开发工具', 'Docker', 'https://www.docker.com/'],
  ['开发工具', 'Nginx', 'https://nginx.org/'],
  ['开发工具', 'Node.js', 'https://nodejs.org/']
] as const;

for (const [category, title, rawUrl] of demo) {
  const url = normalizeUrl(rawUrl);
  const categoryId = row<{ id: string }>('SELECT id FROM categories WHERE name = ?', category)?.id;
  db.prepare(
    'INSERT OR IGNORE INTO websites (id, title, url, url_hash, domain, description, favicon, category_id, source, manual_category, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id(),
    title,
    url,
    hashUrl(url),
    domainOf(url),
    `${category} 默认演示入口`,
    faviconFor(url),
    categoryId ?? null,
    'seed',
    1,
    now()
  );
}

const bookmarkPath = path.resolve(config.root, 'examples/sample-bookmarks.html');
if (fs.existsSync(bookmarkPath)) {
  const content = fs.readFileSync(bookmarkPath, 'utf8');
  const result = importBookmarks({ content, filename: path.basename(bookmarkPath) });
  console.log('Imported sample bookmarks:', result);
}

console.log('Seed complete.');
