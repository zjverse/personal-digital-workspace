import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import { z } from 'zod';
import { config } from './config.js';
import { db, migrate, row, rows } from './db.js';
import { importBookmarks } from './services/bookmarks.js';
import { id, now } from './utils.js';

migrate();

const localOwnerId = 'local-owner';
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const uploadBookmark = upload.single('file') as unknown as express.RequestHandler;

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: config.frontendOrigin === '*' ? true : config.frontendOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

function websiteSelect(where = '1=1') {
  return `
    SELECT w.*,
      c.name as category_name,
      c.color as category_color,
      COALESCE(f.sort_order, 0) as favorite_sort_order,
      CASE WHEN f.website_id IS NULL THEN 0 ELSE 1 END as favorite
    FROM websites w
    LEFT JOIN categories c ON c.id = w.category_id
    LEFT JOIN favorites f ON f.website_id = w.id AND f.user_id = '${localOwnerId}'
    WHERE ${where}
  `;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, database: config.databasePath });
});

app.get('/api/overview', (_req, res) => {
  res.json({
    websites: row<{ count: number }>('SELECT COUNT(*) as count FROM websites WHERE is_archived = 0')?.count ?? 0,
    categories: row<{ count: number }>('SELECT COUNT(*) as count FROM categories')?.count ?? 0,
    favorites: row<{ count: number }>('SELECT COUNT(*) as count FROM favorites WHERE user_id = ?', localOwnerId)?.count ?? 0
  });
});

app.get('/api/categories', (_req, res) => {
  res.json(
    rows(`
      SELECT c.*, COUNT(w.id) as website_count
      FROM categories c
      LEFT JOIN websites w ON w.category_id = c.id AND w.is_archived = 0
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.created_at ASC
    `)
  );
});

app.get('/api/websites', (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const categoryId = String(req.query.categoryId ?? '').trim();
  const view = String(req.query.view ?? '').trim();
  const clauses = ['w.is_archived = 0'];
  const params: unknown[] = [];

  if (q) {
    clauses.push('(w.title LIKE ? OR w.url LIKE ? OR w.description LIKE ? OR w.domain LIKE ? OR c.name LIKE ?)');
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

  res.json(rows(`${websiteSelect(clauses.join(' AND '))} ${order} LIMIT 800`, ...params));
});

app.post('/api/websites/:id/visit', (req, res) => {
  db.prepare('UPDATE websites SET last_visited_at = ? WHERE id = ?').run(now(), req.params.id);
  res.status(204).end();
});

app.post('/api/websites/:id/favorite', (req, res) => {
  if (!row('SELECT id FROM websites WHERE id = ? AND is_archived = 0', req.params.id)) {
    return res.status(404).json({ message: 'Website not found' });
  }
  const nextOrder =
    row<{ max_order: number }>(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as max_order FROM favorites WHERE user_id = ?',
      localOwnerId
    )?.max_order ?? 0;
  db.prepare('INSERT OR IGNORE INTO favorites (user_id, website_id, sort_order) VALUES (?, ?, ?)').run(localOwnerId, req.params.id, nextOrder);
  res.status(204).end();
});

app.delete('/api/websites/:id/favorite', (req, res) => {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND website_id = ?').run(localOwnerId, req.params.id);
  res.status(204).end();
});

app.patch('/api/favorites/order', (req, res) => {
  const body = z.object({ websiteIds: z.array(z.string()).max(500) }).parse(req.body);
  db.exec('BEGIN');
  try {
    body.websiteIds.forEach((websiteId, index) => {
      db.prepare('UPDATE favorites SET sort_order = ? WHERE user_id = ? AND website_id = ?').run(index, localOwnerId, websiteId);
    });
    db.exec('COMMIT');
    res.json({ updated: body.websiteIds.length });
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
});

app.post('/api/bookmarks/import', uploadBookmark, (req, res) => {
  const content = req.file?.buffer.toString('utf8') ?? String(req.body.content ?? '');
  const filename = req.file?.originalname ?? req.body.filename ?? 'bookmarks.html';
  if (!content.trim()) return res.status(400).json({ message: 'Empty bookmark file' });
  res.json({ id: id(), filename, ...importBookmarks({ content, filename }) });
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
  console.log(`Personal Digital Workspace listening on http://localhost:${config.port}`);
});
