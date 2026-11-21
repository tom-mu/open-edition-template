#!/usr/bin/env node
/* Open Edition: the optional build step (Node 18 or later, nothing to install).

   Your host runs `node build.mjs` when it deploys. It writes dist/, the site:
   index.html with the board from BOARD (if set), and the page's title and
   link-preview tags read from Are.na, so a link to your site shows your name and
   first photograph in a message. The photographs themselves are read live in the
   visitor's browser, so a change on the board shows without building again.

     BOARD         your Are.na board (slug or address); else data-board in index.html
     ARENA_TOKEN   optional: your own Are.na personal access token, so this build's
                   reads count against your account. Set it as an encrypted variable on
                   your host. It is only sent to Are.na; it never goes in the page.
     SITE_URL      optional: your site's address, for og:url (Netlify's URL is used
                   when it's there)

   If Are.na can't be reached the page is written without the extra tags, and the
   deploy carries on. Any other files beside index.html (a favicon, say) are copied
   into dist/ as they are.
   ───────────────────────────────────────────────────────────────── */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, cpSync } from 'node:fs';

const ARENA = 'https://api.are.na/v3';
const OUT = 'dist';
// What isn't part of the site.
const SKIP = new Set(['index.html', 'build.mjs', 'netlify.toml', 'wrangler.jsonc', 'wrangler.json', 'wrangler.toml',
  'package.json', 'package-lock.json', 'README.md', 'LICENSE', OUT, 'node_modules', '.git', '.github', '.gitignore',
  '.wrangler', '.netlify', '.env', '.dev.vars', '.DS_Store']);

const SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;
function boardFrom(raw) {
  let v = String(raw || '').trim();
  if (/are\.na\//i.test(v)) {
    try { v = new URL(/^https?:\/\//i.test(v) ? v : 'https://' + v).pathname.split('/').filter(Boolean).pop() || ''; }
    catch { return null; }
  }
  v = v.replace(/\/+$/, '').toLowerCase();
  return SLUG.test(v) && !/^your-board(-slug)?$/.test(v) ? v : null;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clean = (s, n) => clip(String(s).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' '), n);
function clip(s, n) {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), n * 0.6)).replace(/[\s,.;:—–-]+$/, '') + '…';
}

// ── The page ──
const BOARD_ATTR = /(<script\b[^>]*\bdata-board=")([^"]*)(")/;
let html = readFileSync('index.html', 'utf8');
const fromEnv = (process.env.BOARD || '').trim();
const board = boardFrom(fromEnv || html.match(BOARD_ATTR)?.[2]);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const name of readdirSync('.')) {
  if (!SKIP.has(name)) cpSync(name, `${OUT}/${name}`, { recursive: true });
}

if (!board) {
  console.warn(fromEnv
    ? `build: BOARD "${fromEnv}" isn't an Are.na board (use its slug or its address).`
    : 'build: no board yet. Set BOARD on your host, or put your board in data-board in index.html.');
} else {
  html = html.replace(BOARD_ATTR, `$1${esc(board)}$3`);
  try {
    const meta = await boardMeta(board);
    html = withTags(html, meta);
    console.log(`build: ${board}: “${meta.pageTitle}”${meta.image ? ', with its first photograph' : ''}.`);
  } catch (e) {
    console.warn(`build: couldn't read ${board} from Are.na (${e.message}). The page goes out without link-preview tags.`);
  }
}
writeFileSync(`${OUT}/index.html`, html);
console.log(`build: wrote ${OUT}/.`);

// ── The board's title and link-preview tags (as openedition.page makes them) ──
async function boardMeta(slug) {
  const headers = { Accept: 'application/json', 'User-Agent': 'open-edition-template build' };
  // Your own token, from your host's encrypted variables. Only ever sent to Are.na.
  if (process.env.ARENA_TOKEN) headers.Authorization = `Bearer ${process.env.ARENA_TOKEN.trim()}`;
  const get = async url => {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(r.status === 404 ? 'not found: is the board public or closed?' : `HTTP ${r.status}`);
    return r.json();
  };
  const s = encodeURIComponent(slug);
  const [channel, contents] = await Promise.all([get(`${ARENA}/channels/${s}`), get(`${ARENA}/channels/${s}/contents?per=12`)]);
  return readMeta(channel, contents?.data || []);
}

function readMeta(channel, blocks) {
  const THEME_LINE = /^\s*(?:use\s+)?theme\s*[:=-]?\s*([\w-]+)\s*\.?\s*$/i;
  const SETTING_LINE = /^\s*(name|role|background)\s*:\s*(.*?)\s*$/i;
  const plainValue = v => v.replace(/\\(.)/g, '$1').replace(/^[*_]+|[*_]+$/g, '').trim();
  const textOf = v => (typeof v === 'string' ? v : v?.markdown ?? v?.plain ?? '');
  const isText = b => b?.type === 'Text' || b?.class === 'Text';
  const texts = blocks.filter(isText);
  const titled = re => texts.find(b => re.test((b.title || '').trim()));
  const hasTheme = b => textOf(b.content).split('\n').some(l => THEME_LINE.test(l));
  const settingsBlock = titled(/^settings$/i);
  const infoBlock = titled(/^(info|about)$/i)
    || texts.find(b => b !== settingsBlock && hasTheme(b))
    || texts.find(b => b !== settingsBlock);
  const boardNote = textOf(channel?.description);

  const set = {};
  for (const src of [settingsBlock && textOf(settingsBlock.content), infoBlock && textOf(infoBlock.content), boardNote]) {
    for (const line of (src || '').split('\n')) {
      const m = line.match(SETTING_LINE);
      const k = m?.[1].toLowerCase(), v = m && plainValue(m[2]);
      if (v && !(k in set)) set[k] = v;
    }
  }
  // the script tag's data-name and data-role come first, as they do in the page
  const attr = name => clean(html.match(new RegExp(`<script\\b[^>]*\\bdata-${name}="([^"]*)"`))?.[1] || '', 120);
  const owner = clean(attr('name') || set.name || channel?.owner?.name || '', 80);
  const title = clean(channel?.title || '', 120);
  const role = clean(attr('role') || set.role || title, 120);
  const pageTitle = [owner, role].filter(Boolean).join(' — ') || title || 'Photographs';

  const plain = md => md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|\*|_|`)/g, '')
    .replace(/\\(.)/g, '$1');
  const info = plain((infoBlock ? textOf(infoBlock.content) : boardNote)
    .split('\n').filter(l => !THEME_LINE.test(l) && !SETTING_LINE.test(l)).join('\n'))
    .split('\n').map(l => l.trim()).filter(Boolean)
    .reduce((acc, l) => !acc ? l : acc + (/[.!?;:,…]$/.test(acc) ? ' ' : ' · ') + l, '');
  const description = clip(info, 200) || (owner ? `Photographs by ${owner}.` : title ? `${title}.` : '');

  const first = blocks.find(b => (b?.type === 'Image' || b?.class === 'Image') && b.image);
  let image = null;
  if (first) {
    const im = first.image;
    const v = im.large?.src ? im.large : im.medium?.src ? im.medium : { src: im.src, width: im.width, height: im.height };
    if (typeof v.src === 'string' && /^https:\/\//.test(v.src)) {
      image = {
        src: v.src,
        width: Number.isInteger(v.width) ? v.width : 0,
        height: Number.isInteger(v.height) ? v.height : 0,
        alt: clean(im.alt_text || textOf(first.description) || (owner ? `Photograph by ${owner}` : ''), 200),
      };
    }
  }
  return { pageTitle, description, image };
}

function withTags(page, meta) {
  const url = (process.env.SITE_URL || process.env.URL || '').trim();
  const tags = [];
  const m = (attr, key, value) => value && tags.push(`<meta ${attr}="${key}" content="${esc(value)}">`);
  m('name', 'description', meta.description);
  m('property', 'og:type', 'website');
  m('property', 'og:title', meta.pageTitle);
  m('property', 'og:description', meta.description);
  if (/^https?:\/\/[^\s"<>]+$/i.test(url)) {
    m('property', 'og:url', url.replace(/\/?$/, '/'));
    tags.push(`<link rel="canonical" href="${esc(url.replace(/\/?$/, '/'))}">`);
  }
  if (meta.image) {
    m('property', 'og:image', meta.image.src);
    if (meta.image.width && meta.image.height) {
      m('property', 'og:image:width', String(meta.image.width));
      m('property', 'og:image:height', String(meta.image.height));
    }
    m('property', 'og:image:alt', meta.image.alt);
  }
  m('name', 'twitter:card', meta.image ? 'summary_large_image' : 'summary');
  return page
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(meta.pageTitle)}</title>`)
    .replace(/(\n?[ \t]*)<!-- build\.mjs writes[^>]*-->/, (_, ws) => tags.map(t => `${ws}${t}`).join(''));
}
