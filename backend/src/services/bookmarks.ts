import { db, row, rows } from '../db.js';
import { domainOf, faviconFor, hashUrl, htmlDecode, id, normalizeUrl, now } from '../utils.js';

const localOwnerId = 'local-owner';

export type BookmarkItem = {
  title: string;
  url: string;
  addDate?: string;
  icon?: string;
  path: string[];
  order: number;
};

const palettes = ['#d6b25e', '#60a5fa', '#a78bfa', '#22d3ee', '#f59e0b', '#f472b6', '#34d399', '#cbd5e1'];

function attr(line: string, name: string) {
  const quoted = line.match(new RegExp(`${name}\\s*=\\s*(['"])(.*?)\\1`, 'i'));
  if (quoted) return htmlDecode(quoted[2]);
  const plain = line.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i'));
  return plain ? htmlDecode(plain[1]) : undefined;
}

function stripEmojiPrefix(name: string) {
  return name.replace(/^[^\p{Letter}\p{Number}]+/u, '').trim() || name.trim();
}

export function parseBookmarkContent(content: string): BookmarkItem[] {
  const trimmed = content.trimStart();
  if (trimmed.startsWith('{')) return parseChromeJson(JSON.parse(content));
  return parseNetscapeHtml(content);
}

function parseChromeJson(root: unknown): BookmarkItem[] {
  const out: BookmarkItem[] = [];
  let order = 0;
  const visit = (node: any, path: string[]) => {
    if (!node) return;
    if (node.type === 'url' && node.url) {
      out.push({ title: node.name || node.url, url: node.url, addDate: node.date_added, path, order: order++ });
      return;
    }
    const nextPath = node.name ? [...path, node.name] : path;
    for (const child of node.children ?? []) visit(child, nextPath);
  };
  const roots = (root as any).roots ?? root;
  for (const key of Object.keys(roots)) visit(roots[key], []);
  return out;
}

function parseNetscapeHtml(html: string): BookmarkItem[] {
  const stack: string[] = [];
  const out: BookmarkItem[] = [];
  let order = 0;

  const tokens = html.match(/<DT>\s*<H3\b[^>]*>[\s\S]*?<\/H3>|<DT>\s*<A\b[^>]*>[\s\S]*?<\/A>|<\/DL>\s*<p>?|<\/DL>/gi) ?? [];
  for (const token of tokens) {
    if (/<DT>\s*<H3/i.test(token)) {
      const name = htmlDecode(token.replace(/^.*?<H3[^>]*>/i, '').replace(/<\/H3>[\s\S]*$/i, '').trim());
      stack.push(stripEmojiPrefix(name));
      continue;
    }
    if (/<DT>\s*<A/i.test(token)) {
      const url = attr(token, 'HREF');
      if (!url) continue;
      const title = htmlDecode(token.replace(/^.*?<A[^>]*>/i, '').replace(/<\/A>[\s\S]*$/i, '').trim()) || url;
      const addDate = attr(token, 'ADD_DATE');
      const icon = attr(token, 'ICON');
      out.push({ title, url, addDate, icon, path: stack.filter(Boolean), order: order++ });
      continue;
    }
    if (/^<\/DL>/i.test(token) && stack.length) stack.pop();
  }
  return out;
}

function ensureCategory(name: string, parentId: string | null = null) {
  const clean = stripEmojiPrefix(name).slice(0, 48) || '待整理';
  const existing = row<{ id: string }>("SELECT id FROM categories WHERE name = ? AND IFNULL(parent_id, '') = IFNULL(?, '')", clean, parentId);
  if (existing) return existing.id;
  const categoryId = id();
  const count = row<{ count: number }>("SELECT COUNT(*) as count FROM categories WHERE IFNULL(parent_id, '') = IFNULL(?, '')", parentId)?.count ?? 0;
  db.prepare(
    'INSERT INTO categories (id, parent_id, name, icon, color, sort_order, is_system) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(categoryId, parentId, clean, iconForCategory(clean), palettes[count % palettes.length], count + 1, clean === '待整理' ? 1 : 0);
  return categoryId;
}

function ensureCategoryPath(path: string[]) {
  const cleaned = path.map(stripEmojiPrefix).filter(Boolean);
  const bookmarkPath = cleaned[0] === '书签栏' ? cleaned.slice(1) : cleaned;
  const effectivePath = bookmarkPath.length ? bookmarkPath : ['待整理'];
  let parentId: string | null = null;
  let categoryId = '';
  for (const part of effectivePath) {
    categoryId = ensureCategory(part, parentId);
    parentId = categoryId;
  }
  return categoryId;
}

function iconForCategory(name: string) {
  if (/ai|智能|工具/i.test(name)) return 'Sparkles';
  if (/vps|代理|网络|域名/i.test(name)) return 'Server';
  if (/支付|币|卡|钱包/i.test(name)) return 'CreditCard';
  if (/邮箱|账号|接码/i.test(name)) return 'Mail';
  if (/开发|代码|工具/i.test(name)) return 'Code2';
  if (/视频|媒体/i.test(name)) return 'MonitorPlay';
  if (/待整理/i.test(name)) return 'Inbox';
  return 'Folder';
}

export function importBookmarks(params: {
  content: string;
  filename: string;
}) {
  const items = parseBookmarkContent(params.content);
  const unique = new Map<string, BookmarkItem>();
  let duplicateInFile = 0;
  for (const item of items) {
    try {
      const normalized = normalizeUrl(item.url);
      const key = hashUrl(normalized);
      if (unique.has(key)) duplicateInFile += 1;
      unique.set(key, { ...item, url: normalized });
    } catch {
      duplicateInFile += 1;
    }
  }

  const previousHashes = new Set(rows<{ url_hash: string }>('SELECT url_hash FROM websites').map((site) => site.url_hash));
  const incomingHashes = new Set(unique.keys());
  const favoriteHashes = new Map<string, { userId: string; sortOrder: number }[]>();
  for (const favorite of rows<{ user_id: string; url_hash: string; sort_order: number }>(
    'SELECT f.user_id, f.sort_order, w.url_hash FROM favorites f JOIN websites w ON w.id = f.website_id'
  )) {
    if (!favoriteHashes.has(favorite.url_hash)) favoriteHashes.set(favorite.url_hash, []);
    favoriteHashes.get(favorite.url_hash)?.push({ userId: favorite.user_id, sortOrder: favorite.sort_order });
  }

  const added = [...incomingHashes].filter((urlHash) => !previousHashes.has(urlHash)).length;
  const existing = [...incomingHashes].filter((urlHash) => previousHashes.has(urlHash)).length;
  const deleted = [...previousHashes].filter((urlHash) => !incomingHashes.has(urlHash)).length;
  const updated = 0;
  const suspicious = duplicateInFile;
  let imported = 0;

  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM favorites; DELETE FROM websites; DELETE FROM categories;');
    for (const item of unique.values()) {
      const urlHash = hashUrl(item.url);
      const domain = domainOf(item.url);
      const categoryId = ensureCategoryPath(item.path);
      const websiteId = id();
      db.prepare(
        `INSERT INTO websites
         (id, title, url, url_hash, domain, description, favicon, category_id, source, source_path, manual_category, sort_order, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        websiteId,
        item.title.slice(0, 180),
        item.url,
        urlHash,
        domain,
        `来自 ${item.path.join(' / ') || '书签导入'}`,
        item.icon || faviconFor(item.url),
        categoryId,
        'bookmark-import',
        item.path.join(' / '),
        0,
        item.order,
        item.addDate ? new Date(Number(item.addDate) * 1000).toISOString() : now()
      );
      for (const favorite of favoriteHashes.get(urlHash) ?? []) {
        db.prepare('INSERT OR IGNORE INTO favorites (user_id, website_id, sort_order) VALUES (?, ?, ?)').run(favorite.userId || localOwnerId, websiteId, favorite.sortOrder);
      }
      imported += 1;
    }

    db.exec('COMMIT');
    return { total: items.length, imported, added, existing, updated, duplicates: suspicious, deleted };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
