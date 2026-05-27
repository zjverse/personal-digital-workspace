import crypto from 'node:crypto';
import { nanoid } from 'nanoid';

export const id = () => nanoid(14);

export function normalizeUrl(input: string) {
  const trimmed = input.trim();
  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  parsed.hash = parsed.hash || '';
  return parsed.toString();
}

export function domainOf(input: string) {
  try {
    const parsed = new URL(normalizeUrl(input));
    return (parsed.hostname || parsed.protocol.replace(':', '')).replace(/^www\./, '').toLowerCase();
  } catch {
    return 'unknown.local';
  }
}

export function hashUrl(input: string) {
  return crypto.createHash('sha256').update(normalizeUrl(input).toLowerCase()).digest('hex');
}

export function faviconFor(url: string) {
  const domain = domainOf(url);
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(normalizeUrl(url))}&sz=128`;
}

export function generatedFaviconFor(title: string, url: string) {
  const label = (title || domainOf(url) || '?').trim().slice(0, 1).toUpperCase();
  const safeLabel = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const colors = ['#d6b25e', '#5b8def', '#e85d75', '#36a489', '#8b6fe8', '#d97706', '#0ea5e9', '#64748b'];
  const domain = domainOf(url);
  const index = [...domain].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length;
  const bg = colors[index];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="${bg}"/><text x="64" y="76" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="700" text-anchor="middle" fill="#fff">${safeLabel}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function attrOf(tag: string, name: string) {
  const quoted = tag.match(new RegExp(`${name}\\\\s*=\\\\s*(['"])(.*?)\\\\1`, 'i'));
  if (quoted) return quoted[2];
  const plain = tag.match(new RegExp(`${name}\\\\s*=\\\\s*([^\\\\s>]+)`, 'i'));
  return plain?.[1] ?? '';
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeout = 5500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 PersonalDigitalWorkspace/1.0',
        accept: 'text/html,image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        ...(init.headers ?? {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function usableImage(url: string) {
  if (url.startsWith('data:image/')) return url;
  try {
    const res = await fetchWithTimeout(url, { headers: { range: 'bytes=0-4096' } }, 4500);
    if (!res.ok) return '';
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('image/') || /\.(ico|png|jpe?g|svg|webp)(\?|$)/i.test(new URL(res.url).pathname)) return res.url;
  } catch {
    return '';
  }
  return '';
}

export async function discoverFavicon(url: string, title = '') {
  const normalized = normalizeUrl(url);
  const candidates: string[] = [];
  try {
    const res = await fetchWithTimeout(normalized, {}, 6000);
    if (res.ok) {
      const html = await res.text();
      const base = res.url || normalized;
      const links = html.match(/<link\b[^>]*>/gi) ?? [];
      for (const link of links) {
        const rel = attrOf(link, 'rel').toLowerCase();
        const href = attrOf(link, 'href');
        if (!href || !/(^|\s)(shortcut\s+icon|icon|apple-touch-icon|mask-icon)(\s|$)/i.test(rel)) continue;
        try {
          candidates.push(new URL(htmlDecode(href), base).toString());
        } catch {
          // Ignore malformed favicon hrefs.
        }
      }
    }
  } catch {
    // Private or protected sites often block probing; fall back below.
  }

  const origin = new URL(normalized).origin;
  candidates.push(`${origin}/favicon.ico`);
  candidates.push(faviconFor(normalized));
  candidates.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domainOf(normalized))}&sz=128`);

  for (const candidate of [...new Set(candidates)]) {
    const usable = await usableImage(candidate);
    if (usable) return usable;
  }

  return generatedFaviconFor(title, normalized);
}

export function htmlDecode(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function json<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function fetchTitle(url: string) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    const html = await res.text();
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? htmlDecode(match[1].trim()).slice(0, 140) : '';
  } catch {
    return '';
  }
}

export const now = () => new Date().toISOString();
