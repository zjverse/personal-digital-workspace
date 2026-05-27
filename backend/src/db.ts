import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const db = new DatabaseSync(config.databasePath);

db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

export function migrate() {
  db.exec('PRAGMA foreign_keys = OFF;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'Folder',
      color TEXT NOT NULL DEFAULT '#d6b25e',
      sort_order INTEGER NOT NULL DEFAULT 0,
      collapsed INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS websites (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      url_hash TEXT NOT NULL UNIQUE,
      domain TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      favicon TEXT NOT NULL DEFAULT '',
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      source_path TEXT NOT NULL DEFAULT '',
      manual_category INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      last_visited_at TEXT,
      added_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id TEXT NOT NULL DEFAULT 'local-owner',
      website_id TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, website_id)
    );

    CREATE INDEX IF NOT EXISTS idx_websites_domain ON websites(domain);
    CREATE INDEX IF NOT EXISTS idx_websites_category ON websites(category_id);
    CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
  `);

  try {
    db.exec('ALTER TABLE favorites ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;');
  } catch {
    // Existing databases already have this column.
  }

  db.exec(`
    DROP TABLE IF EXISTS favorites_compact;
    CREATE TABLE favorites_compact (
      user_id TEXT NOT NULL DEFAULT 'local-owner',
      website_id TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, website_id)
    );
    INSERT OR IGNORE INTO favorites_compact (user_id, website_id, sort_order, created_at)
    SELECT 'local-owner', website_id, MIN(COALESCE(sort_order, 0)), MIN(created_at)
    FROM favorites
    WHERE website_id IN (SELECT id FROM websites)
    GROUP BY website_id;
    DROP TABLE favorites;
    ALTER TABLE favorites_compact RENAME TO favorites;
  `);

  db.exec(`
    DROP TABLE IF EXISTS website_tags;
    DROP TABLE IF EXISTS tags;
    DROP TABLE IF EXISTS operation_history;
    DROP TABLE IF EXISTS snapshots;
    DROP TABLE IF EXISTS import_history;
    DROP TABLE IF EXISTS users;
  `);

  db.exec('PRAGMA foreign_keys = ON;');
}

export type Row = Record<string, unknown>;

export function rows<T = Row>(sql: string, ...params: any[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function row<T = Row>(sql: string, ...params: any[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}
