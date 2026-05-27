import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, signToken } from './auth.js';
import { config } from './config.js';
import { db, migrate, row, rows } from './db.js';
import {
  createSnapshot,
  importBookmarks,
  restoreSnapshot
} from './services/bookmarks.js';
import { discoverFavicon, domainOf, fetchTitle, hashUrl, id, normalizeUrl, now } from './utils.js';

migrate();

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const uploadBookmark = upload.single('file') as unknown as express.RequestHandler;

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: config.frontendOrigin === '*' ? true : config.frontendOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

const asyncRoute =
  (fn: express.RequestHandler): express.RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

function currentUserId(req: express.Request) {
  return req.user?.id ?? row<{ id: string }>('SELECT id FROM users LIMIT 1')?.id ?? '';
}

function enrichWebsiteQuery(where = '1=1') {
  return `
    SELECT w.*,
      c.name as category_name,
      c.color as category_color,
      COALESCE(f.sort_order, 0) as favorite_sort_order,
      CASE WHEN f.website_id IS NULL THEN 0 ELSE 1 END as favorite,
      COALESCE(json_group_array(json_object('id', t.id, 'name', t.name, 'color', t.color)) FILTER (WHERE t.id IS NOT NULL), '[]') as tags
    FROM websites w
    LEFT JOIN categories c ON c.id = w.category_id
    LEFT JOIN favorites f ON f.website_id = w.id
    LEFT JOIN website_tags wt ON wt.website_id = w.id
    LEFT JOIN tags t ON t.id = wt.tag_id
    WHERE ${where}
    GROUP BY w.id
  `;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, database: config.databasePath });
});

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const user = row<{ id: string; email: string; password_hash: string; role: string }>('SELECT * FROM users WHERE email = ?', body.email);
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    return res.status(401).json({ message: '邮箱或密码错误' });
  }
  res.json({ token: signToken({ id: user.id, email: user.email, role: user.role }), user: { id: user.id, email: user.email, role: user.role } });
}));

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/overview', (_req, res) => {
  res.json({
    websites: row<{ count: number }>('SELECT COUNT(*) as count FROM websites WHERE is_archived = 0')?.count ?? 0,
    categories: row<{ count: number }>('SELECT COUNT(*) as count FROM categories')?.count ?? 0,
    favorites: row<{ count: number }>('SELECT COUNT(*) as count FROM favorites')?.count ?? 0,
    pending: row<{ count: number }>(
      "SELECT COUNT(*) as count FROM websites WHERE category_id = (SELECT id FROM categories WHERE name = '待整理' LIMIT 1)"
    )?.count ?? 0,
    recentImports: rows('SELECT * FROM import_history ORDER BY created_at DESC LIMIT 5')
  });
});

app.get('/api/categories', (_req, res) => {
  const categories = rows('SELECT c.*, COUNT(w.id) as website_count FROM categories c LEFT JOIN websites w ON w.category_id = c.id AND w.is_archived = 0 GROUP BY c.id ORDER BY c.sort_order ASC, c.created_at ASC');
  res.json(categories);
});

app.post('/api/categories', requireAuth, (req, res) => {
  const body = z.object({
    name: z.string().min(1),
    parentId: z.string().nullable().optional(),
    icon: z.string().default('Folder'),
    color: z.string().default('#d6b25e')
  }).parse(req.body);
  const categoryId = id();
  const sort = row<{ count: number }>('SELECT COUNT(*) as count FROM categories')?.count ?? 0;
  db.prepare('INSERT INTO categories (id, parent_id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(
    categoryId,
    body.parentId ?? null,
    body.name,
    body.icon,
    body.color,
    sort + 1
  );
  res.status(201).json(row('SELECT * FROM categories WHERE id = ?', categoryId));
});

app.patch('/api/categories/:id', requireAuth, (req, res) => {
  const body = z.object({
    name: z.string().min(1).optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    collapsed: z.boolean().optional(),
    sortOrder: z.number().optional()
  }).parse(req.body);
  const current = row('SELECT * FROM categories WHERE id = ?', req.params.id);
  if (!current) return res.status(404).json({ message: 'Category not found' });
  db.prepare('UPDATE categories SET name = COALESCE(?, name), icon = COALESCE(?, icon), color = COALESCE(?, color), collapsed = COALESCE(?, collapsed), sort_order = COALESCE(?, sort_order), updated_at = ? WHERE id = ?').run(
    body.name ?? null,
    body.icon ?? null,
    body.color ?? null,
    body.collapsed === undefined ? null : Number(body.collapsed),
    body.sortOrder ?? null,
    now(),
    req.params.id
  );
  res.json(row('SELECT * FROM categories WHERE id = ?', req.params.id));
});

app.delete('/api/categories/:id', requireAuth, (req, res) => {
  const fallback = row<{ id: string }>("SELECT id FROM categories WHERE name = '待整理' LIMIT 1");
  db.prepare('UPDATE websites SET category_id = ?, updated_at = ? WHERE category_id = ?').run(fallback?.id ?? null, now(), req.params.id);
  db.prepare('DELETE FROM categories WHERE id = ? AND is_system = 0').run(req.params.id);
  res.status(204).end();
});

app.get('/api/websites', (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const categoryId = String(req.query.categoryId ?? '').trim();
  const view = String(req.query.view ?? '').trim();
  const clauses = ['w.is_archived = 0'];
  const params: unknown[] = [];
  if (q) {
    clauses.push('(w.title LIKE ? OR w.url LIKE ? OR w.description LIKE ? OR w.domain LIKE ? OR t.name LIKE ?)');
    params.push(...Array(5).fill(`%${q}%`));
  }
  if (categoryId) {
    clauses.push(`w.category_id IN (
      WITH RECURSIVE descendants(id) AS (
        SELECT id FROM categories WHERE id = ?
        UNION ALL
        SELECT c.id FROM categories c JOIN descendants d ON c.parent_id = d.id
      )
      SELECT id FROM descendants
    )`);
    params.push(categoryId);
  }
  if (view === 'favorites') clauses.push('f.website_id IS NOT NULL');
  if (view === 'recent') clauses.push('w.last_visited_at IS NOT NULL');
  const order =
    view === 'recent'
      ? 'ORDER BY w.last_visited_at DESC'
      : view === 'favorites'
        ? 'ORDER BY f.sort_order ASC, f.created_at ASC, w.sort_order ASC'
        : 'ORDER BY w.sort_order ASC, w.created_at ASC';
  res.json(rows(`${enrichWebsiteQuery(clauses.join(' AND '))} ${order} LIMIT 500`, ...params));
});

app.post('/api/websites', requireAuth, asyncRoute(async (req, res) => {
  const body = z.object({
    title: z.string().optional(),
    url: z.string().min(1),
    description: z.string().default(''),
    categoryId: z.string().nullable().optional(),
    tags: z.array(z.string()).default([])
  }).parse(req.body);
  const url = normalizeUrl(body.url);
  const title = body.title || (await fetchTitle(url)) || domainOf(url);
  const favicon = await discoverFavicon(url, title);
  const websiteId = id();
  db.prepare(
    'INSERT INTO websites (id, title, url, url_hash, domain, description, favicon, category_id, manual_category, source, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(websiteId, title, url, hashUrl(url), domainOf(url), body.description, favicon, body.categoryId ?? null, body.categoryId ? 1 : 0, 'manual', now());
  for (const tag of body.tags) {
    let existing = row<{ id: string }>('SELECT id FROM tags WHERE name = ?', tag);
    if (!existing) {
      existing = { id: id() };
      db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(existing.id, tag);
    }
    db.prepare('INSERT OR IGNORE INTO website_tags (website_id, tag_id) VALUES (?, ?)').run(websiteId, existing.id);
  }
  res.status(201).json(row(`${enrichWebsiteQuery('w.id = ?')}`, websiteId));
}));

app.patch('/api/websites/:id', requireAuth, (req, res) => {
  const body = z.object({
    title: z.string().optional(),
    url: z.string().optional(),
    description: z.string().optional(),
    categoryId: z.string().nullable().optional(),
    tags: z.array(z.string()).optional()
  }).parse(req.body);
  const current = row<{ url: string }>('SELECT * FROM websites WHERE id = ?', req.params.id);
  if (!current) return res.status(404).json({ message: 'Website not found' });
  const url = body.url ? normalizeUrl(body.url) : current.url;
  db.prepare(
    'UPDATE websites SET title = COALESCE(?, title), url = ?, url_hash = ?, domain = ?, description = COALESCE(?, description), category_id = COALESCE(?, category_id), manual_category = CASE WHEN ? IS NULL THEN manual_category ELSE 1 END, updated_at = ? WHERE id = ?'
  ).run(body.title ?? null, url, hashUrl(url), domainOf(url), body.description ?? null, body.categoryId ?? null, body.categoryId ?? null, now(), req.params.id);
  if (body.tags) {
    db.prepare('DELETE FROM website_tags WHERE website_id = ?').run(req.params.id);
    for (const tag of body.tags) {
      let existing = row<{ id: string }>('SELECT id FROM tags WHERE name = ?', tag);
      if (!existing) {
        existing = { id: id() };
        db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(existing.id, tag);
      }
      db.prepare('INSERT OR IGNORE INTO website_tags (website_id, tag_id) VALUES (?, ?)').run(req.params.id, existing.id);
    }
  }
  res.json(row(`${enrichWebsiteQuery('w.id = ?')}`, req.params.id));
});

app.delete('/api/websites/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE websites SET is_archived = 1, updated_at = ? WHERE id = ?').run(now(), req.params.id);
  db.prepare('INSERT INTO operation_history (id, type, entity_type, entity_id, summary) VALUES (?, ?, ?, ?, ?)').run(
    id(),
    'delete',
    'website',
    req.params.id,
    '归档网站'
  );
  res.status(204).end();
});

app.post('/api/websites/:id/visit', (req, res) => {
  db.prepare('UPDATE websites SET last_visited_at = ? WHERE id = ?').run(now(), req.params.id);
  res.status(204).end();
});

app.post('/api/websites/:id/favorite', (req, res) => {
  if (!row('SELECT id FROM websites WHERE id = ? AND is_archived = 0', req.params.id)) return res.status(404).json({ message: 'Website not found' });
  const userId = currentUserId(req);
  const nextOrder = (row<{ max_order: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 as max_order FROM favorites WHERE user_id = ?', userId)?.max_order ?? 0);
  db.prepare('INSERT OR IGNORE INTO favorites (user_id, website_id, sort_order) VALUES (?, ?, ?)').run(userId, req.params.id, nextOrder);
  res.status(204).end();
});

app.delete('/api/websites/:id/favorite', (req, res) => {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND website_id = ?').run(currentUserId(req), req.params.id);
  res.status(204).end();
});

app.patch('/api/favorites/order', (req, res) => {
  const body = z.object({ websiteIds: z.array(z.string()).max(500) }).parse(req.body);
  const userId = currentUserId(req);
  db.exec('BEGIN');
  try {
    body.websiteIds.forEach((websiteId, index) => {
      db.prepare('UPDATE favorites SET sort_order = ? WHERE user_id = ? AND website_id = ?').run(index, userId, websiteId);
    });
    db.exec('COMMIT');
    res.json({ updated: body.websiteIds.length });
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
});

app.get('/api/search', (req, res) => {
  const q = `%${String(req.query.q ?? '')}%`;
  res.json(rows(`${enrichWebsiteQuery('(w.title LIKE ? OR w.url LIKE ? OR w.description LIKE ? OR t.name LIKE ?) AND w.is_archived = 0')} ORDER BY w.updated_at DESC LIMIT 80`, q, q, q, q));
});

app.post('/api/bookmarks/import', uploadBookmark, (req, res) => {
  const content = req.file?.buffer.toString('utf8') ?? String(req.body.content ?? '');
  const filename = req.file?.originalname ?? req.body.filename ?? 'bookmarks.json';
  if (!content.trim()) return res.status(400).json({ message: 'Empty bookmark file' });
  res.json(importBookmarks({ content, filename }));
});

app.get('/api/imports', (_req, res) => {
  res.json(rows('SELECT * FROM import_history ORDER BY created_at DESC LIMIT 50'));
});

app.post('/api/imports/:id/rollback', requireAuth, (req, res) => {
  const importRow = row<{ snapshot_id: string }>('SELECT snapshot_id FROM import_history WHERE id = ?', req.params.id);
  if (!importRow?.snapshot_id) return res.status(404).json({ message: 'Import snapshot not found' });
  restoreSnapshot(importRow.snapshot_id);
  res.json({ restored: true, snapshotId: importRow.snapshot_id });
});

app.post('/api/snapshots', requireAuth, (req, res) => {
  const snapshotId = createSnapshot(req.body?.reason ?? 'manual');
  res.status(201).json(row('SELECT id, reason, created_at FROM snapshots WHERE id = ?', snapshotId));
});

app.get('/api/snapshots', requireAuth, (_req, res) => {
  res.json(rows('SELECT id, reason, created_at FROM snapshots ORDER BY created_at DESC LIMIT 100'));
});

app.post('/api/snapshots/:id/restore', requireAuth, (req, res) => {
  restoreSnapshot(req.params.id);
  res.json({ restored: true });
});

app.get('/api/data/export', requireAuth, (_req, res) => {
  res.json({
    exportedAt: now(),
    categories: rows('SELECT * FROM categories'),
    websites: rows('SELECT * FROM websites'),
    tags: rows('SELECT * FROM tags'),
    website_tags: rows('SELECT * FROM website_tags'),
    favorites: rows('SELECT * FROM favorites'),
    import_history: rows('SELECT * FROM import_history'),
    snapshots: rows('SELECT id, reason, created_at FROM snapshots')
  });
});

app.get('/api/history', requireAuth, (_req, res) => {
  res.json(rows('SELECT * FROM operation_history ORDER BY created_at DESC LIMIT 100'));
});

const frontendDist = path.resolve(config.root, 'frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  if (error instanceof z.ZodError) return res.status(422).json({ message: 'Validation error', issues: error.issues });
  if (error instanceof Error) return res.status(500).json({ message: error.message });
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`Personal Digital Workspace API listening on http://localhost:${config.port}`);
});
