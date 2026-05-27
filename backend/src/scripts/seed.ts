import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { migrate } from '../db.js';
import { importBookmarks } from '../services/bookmarks.js';

migrate();

const bookmarkPath = path.resolve(config.root, 'examples/sample-bookmarks.html');

if (!fs.existsSync(bookmarkPath)) {
  console.log('No sample bookmark file found.');
  process.exit(0);
}

const content = fs.readFileSync(bookmarkPath, 'utf8');
const result = importBookmarks({ content, filename: path.basename(bookmarkPath) });

console.log('Imported sample bookmarks:', result);
