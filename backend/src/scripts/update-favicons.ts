import { db, migrate, rows } from '../db.js';
import { discoverFavicon, generatedFaviconFor, now } from '../utils.js';

type WebsiteRow = {
  id: string;
  title: string;
  url: string;
  favicon: string;
};

migrate();

const force = process.argv.includes('--force');
const onlyBroken = process.argv.includes('--only-broken');

function shouldRefresh(site: WebsiteRow) {
  if (force) return true;
  if (!site.favicon) return true;
  if (site.favicon.startsWith('data:image/png;base64')) return true;
  if (site.favicon.includes('google.com/s2/favicons')) return true;
  return false;
}

async function imageWorks(src: string) {
  if (!src || src.startsWith('data:image/svg+xml')) return Boolean(src);
  if (src.startsWith('data:image/')) return true;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(src, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 PersonalDigitalWorkspace/1.0',
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    clearTimeout(timer);
    return res.ok && (res.headers.get('content-type') ?? '').includes('image/');
  } catch {
    return false;
  }
}

const sites = rows<WebsiteRow>(
  'SELECT id, title, url, favicon FROM websites WHERE is_archived = 0 ORDER BY sort_order ASC, created_at ASC'
).filter((site) => (onlyBroken ? true : shouldRefresh(site)));

let updated = 0;
let generated = 0;
let skipped = 0;

for (const [index, site] of sites.entries()) {
  if (onlyBroken && (await imageWorks(site.favicon))) {
    skipped += 1;
    continue;
  }

  const favicon = await discoverFavicon(site.url, site.title);
  const finalIcon = favicon || generatedFaviconFor(site.title, site.url);
  if (finalIcon.startsWith('data:image/svg+xml')) generated += 1;

  db.prepare('UPDATE websites SET favicon = ?, updated_at = ? WHERE id = ?').run(finalIcon, now(), site.id);
  updated += 1;

  console.log(`[${index + 1}/${sites.length}] ${site.title} -> ${finalIcon.slice(0, 90)}`);
}

console.log(JSON.stringify({ checked: sites.length, updated, generated, skipped }, null, 2));
