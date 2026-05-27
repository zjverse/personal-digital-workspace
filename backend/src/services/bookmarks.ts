import { db, row, rows } from '../db.js';
import { domainOf, faviconFor, hashUrl, htmlDecode, id, normalizeUrl, now } from '../utils.js';

export type SyncMode = 'add-only' | 'update-title' | 'full-sync';

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

export function createSnapshot(reason: string) {
  const snapshotId = id();
  const data = {
    categories: rows('SELECT * FROM categories'),
    websites: rows('SELECT * FROM websites'),
    tags: rows('SELECT * FROM tags'),
    website_tags: rows('SELECT * FROM website_tags'),
    favorites: rows('SELECT * FROM favorites')
  };
  db.prepare('INSERT INTO snapshots (id, reason, data) VALUES (?, ?, ?)').run(snapshotId, reason, JSON.stringify(data));
  return snapshotId;
}

export function restoreSnapshot(snapshotId: string) {
  const snap = row<{ data: string }>('SELECT data FROM snapshots WHERE id = ?', snapshotId);
  if (!snap) throw new Error('Snapshot not found');
  const data = JSON.parse(snap.data) as Record<string, Record<string, unknown>[]>;
  db.exec('BEGIN');
  try {
    for (const table of ['favorites', 'website_tags', 'websites', 'tags', 'categories']) db.exec(`DELETE FROM ${table}`);
    for (const table of ['categories', 'websites', 'tags', 'website_tags', 'favorites']) {
      for (const record of data[table] ?? []) {
        const keys = Object.keys(record);
        const placeholders = keys.map(() => '?').join(',');
        db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`).run(...(keys.map((key) => record[key]) as any[]));
      }
    }
    db.prepare('INSERT INTO operation_history (id, type, entity_type, entity_id, summary) VALUES (?, ?, ?, ?, ?)').run(
      id(),
      'restore',
      'snapshot',
      snapshotId,
      '恢复数据库快照'
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
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

function tagsFor(bookmark: BookmarkItem, categoryName: string) {
  const domain = domainOf(bookmark.url).split('.').slice(0, -1).join('.') || domainOf(bookmark.url);
  const folderTag = bookmark.path.at(-1);
  return Array.from(new Set([categoryName, folderTag, domain].filter(Boolean).map((item) => String(item).slice(0, 32))));
}

function attachTags(websiteId: string, tagNames: string[]) {
  for (const name of tagNames) {
    let tag = row<{ id: string }>('SELECT id FROM tags WHERE name = ?', name);
    if (!tag) {
      tag = { id: id() };
      db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(tag.id, name);
    }
    db.prepare('INSERT OR IGNORE INTO website_tags (website_id, tag_id) VALUES (?, ?)').run(websiteId, tag.id);
  }
}

export function importBookmarks(params: {
  content: string;
  filename: string;
  mode?: SyncMode;
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

  const snapshotId = createSnapshot(`import:${params.filename}`);
  const favoriteHashes = new Map<string, { userId: string; sortOrder: number }[]>();
  for (const favorite of rows<{ user_id: string; url_hash: string; sort_order: number }>(
    'SELECT f.user_id, f.sort_order, w.url_hash FROM favorites f JOIN websites w ON w.id = f.website_id'
  )) {
    if (!favoriteHashes.has(favorite.url_hash)) favoriteHashes.set(favorite.url_hash, []);
    favoriteHashes.get(favorite.url_hash)?.push({ userId: favorite.user_id, sortOrder: favorite.sort_order });
  }
  let added = 0;
  let existing = 0;
  let updated = 0;
  let suspicious = duplicateInFile;

  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM website_tags; DELETE FROM favorites; DELETE FROM websites; DELETE FROM tags; DELETE FROM categories;');
    for (const item of unique.values()) {
      const urlHash = hashUrl(item.url);
      const domain = domainOf(item.url);
      if (row('SELECT id FROM websites WHERE domain = ? LIMIT 1', domain)) suspicious += 1;
      const categoryId = ensureCategoryPath(item.path);
      const categoryName = stripEmojiPrefix(item.path.at(-1) ?? '待整理');
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
        db.prepare('INSERT OR IGNORE INTO favorites (user_id, website_id, sort_order) VALUES (?, ?, ?)').run(favorite.userId, websiteId, favorite.sortOrder);
      }
      attachTags(websiteId, tagsFor(item, categoryName));
      added += 1;
    }

    const deleted = 0;

    const importId = id();
    db.prepare(
      `INSERT INTO import_history
       (id, filename, mode, total_count, added_count, existing_count, updated_count, duplicate_count, deleted_count, snapshot_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(importId, params.filename, 'html-order-replace', items.length, added, existing, updated, suspicious, deleted, snapshotId);
    db.prepare('INSERT INTO operation_history (id, type, entity_type, entity_id, summary, import_id) VALUES (?, ?, ?, ?, ?, ?)').run(
      id(),
      'import',
      'bookmark',
      importId,
      `导入 ${params.filename}: 新增 ${added}, 已存在 ${existing}`,
      importId
    );
    db.exec('COMMIT');
    return { importId, snapshotId, total: items.length, added, existing, updated, duplicates: suspicious, deleted };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function previewSmartClassification() {
  return [];
}

export function applySmartClassification(ids: string[]) {
  void ids;
  return { changed: 0, snapshotId: '' };
}
