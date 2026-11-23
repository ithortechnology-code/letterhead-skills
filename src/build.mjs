#!/usr/bin/env node
// Letterhead engine. Company-specific data lives in ./company (config.json, assets/, letters/, out/, templates/).
//   node src/build.mjs --doctor                       check setup
//   node src/build.mjs --templates                    list templates and sizes
//   node src/build.mjs --new <slug> [--template X --size A5]
//   node src/build.mjs company/letters/<file>.md [--open] [--no-pdf]
//   node src/build.mjs --all | --blank | --index
//   node src/build.mjs --preview [--open]               sample letter in every template + size, with a gallery page
//   node src/build.mjs --trim-svg <in.svg> [out.svg]   crop an SVG's canvas tightly to its artwork
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { marked } from 'marked';
import YAML from 'yaml';
import { sealSvg } from './seal.mjs';
import { writeZip, collect } from './zip.mjs';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
// Three ways this runs: from the repo (npm run ...), from the bundled dist/letterhead.mjs (Claude Code plugin), or from a
// portable skill folder (scripts/letterhead.mjs). Only the repo keeps company data inside itself; installed copies are
// read-only and get replaced on update, so company data lives in ./company of the folder you work in.
const FROM_SOURCE = /[\\/]src[\\/]build\.mjs$/.test(SELF);
const pick = (...c) => c.find((p) => fs.existsSync(p));
const CSS_DIR = pick(path.join(ROOT, 'src'), path.join(ROOT, 'assets'));
const FONT_DIR = pick(path.join(ROOT, 'fonts'), path.join(ROOT, 'node_modules', '@fontsource', 'carlito', 'files'));
const rel = (p) => path.relative(process.cwd(), p) || '.';
const COMPANY = process.env.LETTERHEAD_COMPANY_DIR ? path.resolve(process.env.LETTERHEAD_COMPANY_DIR) : FROM_SOURCE ? path.join(ROOT, 'company') : path.resolve(process.cwd(), 'company');
const LETTERS = path.join(COMPANY, 'letters');
const OUT = path.join(COMPANY, 'generated');   // everything the tool builds (drafts and finals)
const APPROVED = path.join(COMPANY, 'approved'); // copies the user has signed off (npm run approve)
const CONFIG_FILE = path.join(COMPANY, 'config.json');
const TEMPLATE_DIRS = [path.join(ROOT, 'templates'), path.join(COMPANY, 'templates')]; // company/ overrides built-ins

const SIZES = {
  A4: { w: 210, h: 297, m: [12, 15, 10, 15], fs: '11pt' }, // margins: top right bottom left (mm)
  A5: { w: 148, h: 210, m: [10, 12, 8, 12], fs: '10pt' },
};

let config = null;
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error('No company set up yet (company/config.json is missing). Run the /setup-letterhead skill, or copy starter/config.example.json to company/config.json.');
  }
  config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return config;
}

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const nl2br = (s = '') => esc(String(s).trim()).replace(/\n/g, '<br>');

// ---------- templates ----------
function listTemplates() {
  const byId = new Map();
  for (const dir of TEMPLATE_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const id of fs.readdirSync(dir)) {
      const css = path.join(dir, id, 'template.css');
      if (!fs.existsSync(css)) continue;
      const jsonFile = path.join(dir, id, 'template.json');
      const meta = fs.existsSync(jsonFile) ? JSON.parse(fs.readFileSync(jsonFile, 'utf8')) : {};
      byId.set(id, { id, title: id, description: '', sizes: ['A4', 'A5'], ...meta, css, custom: dir.startsWith(COMPANY) });
    }
  }
  return [...byId.values()];
}

function resolveLook(template, size) {
  const id = template || config.defaultTemplate || 'classic';
  const tpl = listTemplates().find((t) => t.id === id);
  if (!tpl) throw new Error(`Unknown template "${id}". Available: ${listTemplates().map((t) => t.id).join(', ')}`);
  const sizeKey = String(size || config.defaultSize || 'A4').toUpperCase();
  if (!SIZES[sizeKey]) throw new Error(`Unknown size "${size}". Available: ${Object.keys(SIZES).join(', ')}`);
  return { id, sizeKey, tpl };
}

// ---------- assets ----------
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const fileUri = (p) => `data:${MIME[path.extname(p).toLowerCase()] || 'application/octet-stream'};base64,${fs.readFileSync(p).toString('base64')}`;

// Path in config is relative to company/. Supports svg / png / jpg / webp.
function assetUri(rel) {
  if (!rel) return null;
  const p = path.resolve(COMPANY, rel);
  if (!fs.existsSync(p)) return null;
  if (path.extname(p).toLowerCase() === '.pdf') {
    throw new Error(`${rel}: PDF assets are not supported. Export the logo/signature as SVG or PNG (transparent background).`);
  }
  return fileUri(p);
}

function fontFaces() {
  const dir = FONT_DIR || '';
  return [['400', 'normal'], ['400', 'italic'], ['700', 'normal'], ['700', 'italic']]
    .map(([w, s]) => [w, s, path.join(dir, `carlito-latin-${w}-${s}.woff2`)])
    .filter(([, , f]) => fs.existsSync(f))
    .map(([w, s, f]) => `@font-face{font-family:'Carlito';font-weight:${w};font-style:${s};src:url(${fileUri(f)}) format('woff2');}`)
    .join('\n');
}

// ---------- letter ----------
function formatDate(d) {
  const date = d ? new Date(d) : new Date();
  if (Number.isNaN(date.getTime())) return esc(d); // free text allowed
  return date.toLocaleDateString(config.locale || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function parseLetter(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  return m ? { meta: YAML.parse(m[1]) || {}, body: m[2] } : { meta: {}, body: raw };
}

function resolveSignatory(meta) {
  const key = typeof meta.signatory === 'string' ? meta.signatory : 'default';
  if (typeof meta.signatory === 'string' && !config.signatories?.[key]) console.warn(`  ! signatory "${key}" not in company/config.json`);
  return { ...(config.signatories?.[key] || {}), ...(typeof meta.signatory === 'object' ? meta.signatory : {}) };
}

// Small signature and/or seal printed bottom-right on EVERY page (front matter: page_marks).
function pageMarksHtml(meta) {
  const mode = meta.page_marks || 'none';
  if (!['signature', 'seal', 'both'].includes(mode)) { if (mode !== 'none') console.warn(`  ! page_marks "${mode}" unknown (none | signature | seal | both)`); return ''; }
  const person = resolveSignatory(meta);
  let out = '';
  if (mode === 'signature' || mode === 'both') {
    const uri = assetUri(person.signature);
    if (uri) out += `<img class="mark-sig" src="${uri}" alt="">`;
    else console.warn(`  ! page_marks needs a signature file (${person.signature}) but none was found`);
  }
  if (mode === 'seal' || mode === 'both') out += `<div class="mark-seal">${sealSvg({ topText: config.company.name, ...config.seal })}</div>`;
  return out ? `<div class="page-marks">${out}</div>` : '';
}

function closingHtml(meta) {
  if (meta.signoff === false) return '';
  const person = resolveSignatory(meta);

  let sig = '';
  if (meta.sign) {
    const uri = assetUri(person.signature);
    if (uri) sig = `<img class="signature" src="${uri}" alt="">`;
    else console.warn(`  ! sign: true but no signature file found (${person.signature}). Leaving space for a wet signature.`);
  }
  // seal: true (shape from config.seal.shape) | round | square | both | false
  const sealMode = meta.seal === true ? (config.seal?.shape || 'round') : ['round', 'square', 'both'].includes(meta.seal) ? meta.seal : null;
  const roundSvg = sealMode === 'round' || sealMode === 'both' ? sealSvg({ topText: config.company.name, ...config.seal }) : '';
  const sq = config.seal?.square || {};
  let sigboxHtml;
  if (sealMode === 'square' || sealMode === 'both') {
    // Rectangular signatory stamp: "For <company>", blank space (signature goes inside), then designation / role.
    const lines = sq.bottom ? [...sq.bottom] : [...new Set([person.designation, person.role || 'Authorised Signatory'].filter(Boolean))];
    if (sq.showName && person.name) lines.unshift(person.name);
    sigboxHtml = `<div class="sigbox sigbox-stamp">
      <div class="stamp${sq.border ? ' stamp-bordered' : ''}" style="--seal:${esc(config.seal?.color || '#1F3A93')}">
        <div class="stamp-for">${esc(sq.top || `For ${config.company.name}`)}</div>
        <div class="stamp-space">${sig}</div>
        <div class="stamp-lines">${lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
      </div>
      ${sealMode === 'both' ? `<div class="stamp-round">${roundSvg}</div>` : ''}
    </div>`;
  } else {
    sigboxHtml = `<div class="sigbox">
      <div class="sig-for">For ${esc(config.company.name)}</div>
      <div class="sig-area">${roundSvg ? `<div class="seal">${roundSvg}</div>` : ''}${sig}</div>
      ${person.name ? `<div class="sig-name">${esc(person.name)}</div>` : ''}
      ${person.designation ? `<div class="sig-desig">${esc(person.designation)}</div>` : ''}
      <div class="sig-role">${esc(person.role || 'Authorised Signatory')}</div>
    </div>`;
  }

  const place = meta.place === false ? '' : meta.place || config.place;
  const encl = meta.enclosures;
  const enclHtml = !encl ? '' : Array.isArray(encl) && encl.length > 1
    ? `<div><b>Encl.:</b><ol>${encl.map((e) => `<li>${esc(e)}</li>`).join('')}</ol></div>`
    : `<div><b>Encl.:</b> ${esc(Array.isArray(encl) ? encl[0] : encl)}</div>`;
  const cc = meta.cc ? `<div><b>CC:</b> ${(Array.isArray(meta.cc) ? meta.cc : [meta.cc]).map(esc).join('; ')}</div>` : '';

  return `${meta.closing ? `<p class="closing">${esc(meta.closing)}</p>` : ''}
  <div class="closing-row">
    <div class="closing-left">
      ${place ? `<div><b>Place:</b> ${esc(place)}</div>` : ''}
      ${enclHtml}${cc}
    </div>
    ${sigboxHtml}
  </div>`;
}

// Runs in the page: estimates how many printed pages the letter needs and how much room is spare.
// Shown in the toolbar, and read by the build (data-fit="pages|spareMm") to warn about tight one-page letters.
const FIT_SCRIPT = `<script>
(function(){
  function fit(){
    var cs=getComputedStyle(document.documentElement), n=function(v){return parseFloat(cs.getPropertyValue(v))};
    var avail=n('--ph')-n('--mt')-n('--mb'), t=document.querySelector('table.layout'); if(!t) return;
    var h=t.getBoundingClientRect().height*25.4/96, pages=Math.max(1,Math.ceil(h/avail-0.001)), spare=+(pages*avail-h).toFixed(1);
    document.documentElement.setAttribute('data-fit',pages+'|'+spare);
    var el=document.getElementById('tbfit'); if(!el) return;
    var need=n('--ph')>=290?18:6, tight=pages===1&&spare<need;
    el.textContent=(pages===1?'1 page · '+spare+' mm spare':'about '+pages+' pages · '+spare+' mm free on the last')+(tight?(n('--ph')>=290?' · fits A4 but may split on Letter paper or in Safari: choose A4, or shorten':' · tight: may spill onto a 2nd page'):'');
    el.className='tb-fit'+(tight?' warn':'');
  }
  addEventListener('load',fit); if(document.fonts&&document.fonts.ready) document.fonts.ready.then(fit);
})();
</script>`;

function renderHtml({ meta = {}, body = '' }, { blank = false, look, pdfName = null } = {}) {
  const c = config.company;
  const b = { accent: '#1F3A93', text: '#1F2328', muted: '#5B6472', border: '#2B2F36', boxBorder: '#8A94A6', ...config.brand };
  const logo = assetUri(config.logo);
  if (!logo) console.warn(`  ! logo not found (${config.logo}) — header will show without logo`);
  const regs = Object.entries(c.registrations || {}).filter(([, v]) => v);
  const nameScale = Math.min(1, Math.max(0.55, 28 / String(c.name).length)); // long company names shrink to stay on one line, so the header keeps its height
  const sz = SIZES[look.sizeKey];
  const [mt, mr, mb, ml] = sz.m;
  let css = [
    `@page { size: ${sz.w}mm ${sz.h}mm; margin: ${mt}mm 0 ${mb}mm 0; }`,
    `:root{--fs:${sz.fs};--pw:${sz.w}mm;--ph:${sz.h}mm;--mt:${mt}mm;--mr:${mr}mm;--mb:${mb}mm;--ml:${ml}mm;` +
      `--accent:${b.accent};--text:${b.text};--muted:${b.muted};--border:${b.border};--box-border:${b.boxBorder};}`,
    fs.readFileSync(path.join(CSS_DIR, 'base.css'), 'utf8'),
    fs.readFileSync(look.tpl.css, 'utf8'),
    fs.readFileSync(path.join(CSS_DIR, 'screen.css'), 'utf8'), // last: browser-preview overrides
  ].join('\n');

  // Markers inside the Markdown body:  \pagebreak  (or {{pagebreak}})  and  {{signature}}
  const prepared = body
    .replace(/^[ \t]*(?:\\pagebreak|\{\{\s*pagebreak\s*\}\}|<!--\s*pagebreak\s*-->)[ \t]*$/gim, '\n\n@@PAGEBREAK@@\n\n')
    .replace(/^[ \t]*\{\{\s*signature\s*\}\}[ \t]*$/gim, '\n\n@@SIGNATURE@@\n\n');
  let atMarker = meta.signature_at === 'marker';
  if (atMarker && !prepared.includes('@@SIGNATURE@@')) { console.warn('  ! signature_at: marker but no {{signature}} in the body; placing the block at the end'); atMarker = false; }
  const sigHtml = blank ? '' : closingHtml(meta);
  const bodyHtml = marked.parse(prepared)
    .replace(/<p>\s*@@PAGEBREAK@@\s*<\/p>/g, '<div class="pagebreak"></div>')
    .replace(/<p>\s*@@SIGNATURE@@\s*<\/p>/g, atMarker ? `<div class="inline-sign">${sigHtml}</div>` : '');
  const marks = blank ? '' : pageMarksHtml(meta);
  if (meta.page_numbers) {
    css += `\n@page { @bottom-center { content: "Page " counter(page) " of " counter(pages); font: 8pt Carlito, Calibri, sans-serif; color: #5B6472; text-align: right; padding-right: ${mr}mm; vertical-align: middle; } }`;
  }

  const letter = blank ? '' : `
    <div class="meta-row">
      <div>${meta.ref ? `<b>Ref. No.:</b> ${esc(meta.ref)}` : ''}</div>
      <div><b>Date:</b> ${formatDate(meta.date)}</div>
    </div>
    ${meta.to ? `<div class="to"><b>To,</b><div class="recipient">${nl2br(meta.to)}</div></div>` : ''}
    ${meta.subject ? `<p class="subject"><b>Subject:</b> <u>${esc(meta.subject)}</u></p>` : ''}
    <div class="body">${bodyHtml}</div>
    ${atMarker ? '' : sigHtml}`;

  const title = [meta.ref, meta.subject].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, '-') || `${c.name} letterhead`;
  const tip = 'Print settings: Paper size A4, Margins Default, Scale 100%, Headers and footers OFF.';

  return `<!doctype html>
<html lang="en" data-size="${look.sizeKey}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${fontFaces()}\n${css}</style></head>
<body>
  <div class="toolbar">
    <div class="tb-title">${esc(meta.ref || 'Letterhead')}${meta.subject ? ` · ${esc(meta.subject)}` : ''}</div>
    ${blank ? '' : '<div class="tb-fit" id="tbfit"></div>'}
    <div class="tb-tip">${esc(tip)}</div>
    ${pdfName ? `<a class="btn" href="${esc(pdfName)}" download>Download PDF</a>` : ''}
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="sheet">
  <header class="page-header">
    <div class="hbox">
      <div class="hleft">
        ${logo ? `<img class="logo" src="${logo}" alt="">` : ''}
        <div>
          <div class="cname"${nameScale < 1 ? ` style="zoom:${nameScale.toFixed(2)};white-space:nowrap"` : ''}>${esc(c.name)}</div>
          ${regs.length ? `<div class="regs">${regs.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<span class="sep">|</span>')}</div>` : ''}
          ${c.website ? `<div class="web">${esc(c.website)}</div>` : ''}
        </div>
      </div>
      <div class="hright">
        <div class="addr">${esc(c.address).toUpperCase()}</div>
        ${c.email ? `<div>${esc(c.email)}</div>` : ''}
        ${c.phone ? `<div>Ph: ${esc(c.phone)}</div>` : ''}
      </div>
    </div>
  </header>

  <footer class="page-footer">
    <b>${esc(c.name)}</b>
    ${[c.address, ...regs.map(([k, v]) => `${k}: ${v}`), c.website].filter(Boolean).map((x) => `<span class="dot">•</span>${esc(x)}`).join('')}
    ${marks}
  </footer>

  ${config.watermark && logo ? `<img class="watermark" src="${logo}" alt="">` : ''}

  <table class="layout">
    <thead><tr><td><div class="header-space"></div></td></tr></thead>
    <tbody><tr><td>${letter}</td></tr></tbody>
    <tfoot><tr><td><div class="footer-space"></div>${marks ? '<div class="marks-space"></div>' : ''}</td></tr></tfoot>
  </table>
  </div>
${blank ? '' : FIT_SCRIPT}
</body></html>`;
}

// ---------- PDF (optional: needs Chrome/Edge/Brave) ----------
function findChrome() {
  return [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean).find((p) => fs.existsSync(p)) || null;
}

function toPdf(chrome, htmlFile, pdfFile) {
  fs.rmSync(pdfFile, { force: true });
  const res = spawnSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--print-to-pdf-no-header',
    '--no-first-run', '--no-default-browser-check', '--virtual-time-budget=2000',
    `--print-to-pdf=${pdfFile}`, `file://${path.resolve(htmlFile)}`,
  ], { stdio: 'pipe' });
  if (!fs.existsSync(pdfFile)) throw new Error(`PDF render failed:\n${res.stderr?.toString()}`);
}

function openFile(file) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [file]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : ['xdg-open', [file]];
  try { execFileSync(cmd, args, { stdio: 'ignore' }); } catch { console.log(`  (open it manually: ${file})`); }
}

// Loads the page in headless Chrome and reads the fit estimate the page computed about itself.
function measureFit(htmlFile) {
  const chrome = findChrome();
  if (!chrome) return null;
  const res = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--virtual-time-budget=3000', '--dump-dom', `file://${path.resolve(htmlFile)}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = (res.stdout || '').match(/data-fit="(\d+)\|(-?[\d.]+)"/);
  return m ? { pages: +m[1], spare: +m[2] } : null;
}

let chromeNoticeShown = false;
function build(file, { blank = false, open = false, pdf = true, template, size } = {}) {
  const letter = blank ? { meta: {}, body: '' } : parseLetter(file);
  const look = resolveLook(template || letter.meta.template, size || letter.meta.size); // CLI > front matter > config
  const name = blank ? `letterhead-blank-${look.id}-${look.sizeKey}` : path.basename(file, path.extname(file));
  const outDir = blank ? path.join(OUT, 'blank') : OUT;
  fs.mkdirSync(outDir, { recursive: true });
  const htmlFile = path.join(outDir, `${name}.html`);
  const pdfFile = path.join(outDir, `${name}.pdf`);
  const canPdf = pdf && !!findChrome();
  fs.writeFileSync(htmlFile, renderHtml(letter, { blank, look, pdfName: canPdf ? `${name}.pdf` : null }));
  console.log(`✓ ${rel(htmlFile)}`);
  if (!blank) {
    const fit = measureFit(htmlFile);
    const need = look.sizeKey === 'A4' ? 18 : 6; // A4 letters should also fit US Letter paper (about 18 mm shorter), which Safari often defaults to
    if (fit && fit.pages === 1 && fit.spare < need) console.warn(`  ! only ${fit.spare} mm spare on the page. It fits A4 but may split onto a 2nd page on Letter paper or in Safari. Shorten the text a little (aim for ${need}+ mm).`);
    else if (fit && fit.pages === 1) console.log(`  (1 page, ${fit.spare} mm spare)`);
  }

  if (pdf) {
    const chrome = findChrome();
    if (chrome) {
      toPdf(chrome, htmlFile, pdfFile);
      const pdfText = fs.readFileSync(pdfFile).toString('latin1');
      const counts = [...pdfText.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g)].map((m) => +m[1]);
      const pages = counts.length ? Math.max(...counts) : null;
      console.log(`✓ ${rel(pdfFile)}${pages ? ` (${pages} page${pages === 1 ? '' : 's'})` : ''}`);
    }
    else if (!chromeNoticeShown) { chromeNoticeShown = true; console.log('  (no Chrome/Edge found, so no PDF copy was made. Open the HTML and use the Print button.)'); }
  }
  if (!blank) buildIndex();
  if (open) openFile(htmlFile);
}

// ---------- numbering ----------
function financialYear(d = new Date()) { // Indian FY (April–March), e.g. 2026-27
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
function refPrefix() {
  const base = config.refPrefix || 'REF';
  const scheme = config.refScheme || 'fy';
  if (scheme === 'none') return `${base}/`;
  return `${base}/${scheme === 'calendar' ? new Date().getFullYear() : financialYear()}/`;
}
function nextRef() {
  const prefix = refPrefix();
  let max = 0;
  for (const f of fs.existsSync(LETTERS) ? fs.readdirSync(LETTERS) : []) {
    if (!f.endsWith('.md')) continue;
    const ref = String(parseLetter(path.join(LETTERS, f)).meta.ref || '');
    if (ref.startsWith(prefix)) max = Math.max(max, parseInt(ref.slice(prefix.length), 10) || 0);
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

function scaffold(slug, template, size) {
  const look = resolveLook(template, size);
  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(LETTERS, `${today}-${slug.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.md`);
  if (fs.existsSync(file)) throw new Error(`${rel(file)} already exists`);
  fs.mkdirSync(LETTERS, { recursive: true });
  fs.writeFileSync(file, `---
ref: ${nextRef()}
date: ${today}
to: |
  Recipient Name / Designation
  Organization / Department
  Address Line, City, PIN Code, Country
subject: Subject of the letter
template: ${look.id}
size: ${look.sizeKey}
signatory: default   # key in company/config.json → signatories
sign: false          # true = place the signature image
seal: false          # true = place the company seal
# --- multi-page signing (see the new-letter skill) ---
# page_marks: none          # none | signature | seal | both : small mark bottom-right on EVERY page
# page_numbers: false       # true = "Page 1 of 3" at the bottom
# signature_at: end         # end | marker : marker puts the full block where you write {{signature}} in the body
# place: ${config.place || 'City'}
# enclosures: [As applicable]
# cc: [Name]
# closing: Yours faithfully,
---

Dear Sir / Madam,

Write the letter here. **Markdown** works: lists, bold, tables.
`);
  console.log(`✓ created ${rel(file)}`);
}

// ---------- archive index + approval ----------
const INDEX_CSS = `body{font:15px/1.5 -apple-system,'Segoe UI',Roboto,sans-serif;margin:0;background:#f4f5f7;color:#1f2328}
 main{max-width:1000px;margin:0 auto;padding:32px 20px}
 h1{font-size:20px;margin:0 0 4px} p{color:#5b6472;margin:0 0 20px}
 table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #dde1e7;border-radius:8px;overflow:hidden}
 th,td{text-align:left;padding:10px 14px;border-bottom:1px solid #eceef2;vertical-align:top} th{background:#fafbfc;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5b6472}
 tr:last-child td{border-bottom:none} a{color:#0b5fff;text-decoration:none;margin-right:10px} .muted{color:#5b6472}
 .ok{color:#137333;font-weight:600} .draft{color:#8a6d00}`;

function indexRows(dir, onlyApproved) {
  return (fs.existsSync(LETTERS) ? fs.readdirSync(LETTERS) : []).filter((f) => f.endsWith('.md')).map((f) => {
    const name = f.replace(/\.md$/, '');
    const { meta } = parseLetter(path.join(LETTERS, f));
    return { name, ref: meta.ref || '', date: meta.date ? String(meta.date).slice(0, 10) : '', to: String(meta.to || '').split('\n')[0],
      subject: meta.subject || '', html: fs.existsSync(path.join(dir, `${name}.html`)), pdf: fs.existsSync(path.join(dir, `${name}.pdf`)),
      approved: fs.existsSync(path.join(APPROVED, `${name}.md`)) };
  }).filter((r) => (onlyApproved ? r.approved : true)).sort((a, b) => (b.date + b.ref).localeCompare(a.date + a.ref));
}

function writeIndex(dir, title, intro, rows, showStatus) {
  fs.mkdirSync(dir, { recursive: true });
  const link = (ok, href, label) => (ok ? `<a href="${esc(href)}">${label}</a>` : '');
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(config.company.name)} - ${esc(title)}</title><style>${INDEX_CSS}</style></head><body><main>
<h1>${esc(config.company.name)} - ${esc(title)}</h1><p>${rows.length} letter${rows.length === 1 ? '' : 's'}. ${esc(intro)}</p>
<table><thead><tr><th>Ref</th><th>Date</th><th>To</th><th>Subject</th>${showStatus ? '<th>Status</th>' : ''}<th>Open</th></tr></thead><tbody>
${rows.map((r) => `<tr><td>${esc(r.ref)}</td><td>${esc(r.date)}</td><td>${esc(r.to)}</td><td>${esc(r.subject)}</td>${showStatus ? `<td>${r.approved ? '<span class="ok">Approved</span>' : '<span class="draft">Draft</span>'}</td>` : ''}<td>${link(r.html, r.name + '.html', 'View / Print')}${link(r.pdf, r.name + '.pdf', 'PDF')}</td></tr>`).join('') || `<tr><td colspan="${showStatus ? 6 : 5}" class="muted">No letters yet.</td></tr>`}
</tbody></table></main></body></html>`);
}

function buildIndex() {
  writeIndex(OUT, 'Generated letters', 'Everything the tool has built, drafts and finals. Open a letter to review it; the final, signed-off copies are in the approved folder.', indexRows(OUT, false), true);
  if (fs.existsSync(APPROVED)) writeIndex(APPROVED, 'Approved letters', 'Final copies that have been signed off. These are the ones to send. Do not edit them.', indexRows(APPROVED, true), false);
}

// Copy a reviewed letter (HTML + PDF + its source text) into company/approved/.
function approve(nameArg, force) {
  const base = path.basename(String(nameArg)).replace(/\.(md|html|pdf)$/i, '');
  const src = path.join(LETTERS, `${base}.md`);
  if (!fs.existsSync(src)) throw new Error(`No letter "${base}" in company/letters/. Names look like 2026-11-23-my-letter.`);
  const { meta, body } = parseLetter(src);
  if (/Write the letter here|Recipient Name \/ Designation|^Subject of the letter$/m.test(`${body}\n${meta.to || ''}\n${meta.subject || ''}`)) {
    throw new Error('This letter still has the template placeholder text. Fill it in before approving.');
  }
  if (!force && fs.existsSync(path.join(APPROVED, `${base}.md`))) {
    throw new Error(`${base} is already approved. Approved copies are final: issue a new letter for changes (or add --force to replace it).`);
  }
  build(src, { pdf: true }); // approve exactly what the current text produces
  fs.mkdirSync(APPROVED, { recursive: true });
  fs.copyFileSync(src, path.join(APPROVED, `${base}.md`));
  for (const ext of ['html', 'pdf']) {
    const from = path.join(OUT, `${base}.${ext}`);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(APPROVED, `${base}.${ext}`));
    else console.warn(`  ! no ${ext.toUpperCase()} to copy (${ext === 'pdf' ? 'Chrome/Edge not found' : 'build failed'})`);
  }
  buildIndex();
  console.log(`✓ approved: ${rel(path.join(APPROVED, base))}.pdf`);
}

// ---------- personal skill pack (portable edition) ----------
// Bundles this skill together with the user's company/ folder into one zip they can upload as their own skill,
// so company details, assets and the letter register (numbering) survive between chats.
function pack(outArg) {
  if (!fs.existsSync(path.join(ROOT, 'SKILL.md'))) throw new Error('--pack runs from the portable skill (the folder with SKILL.md). It packs the skill together with your company/ folder.');
  const slug = String(config.company.name).toLowerCase().replace(/\b(private|limited|pvt|ltd|llp|inc|llc)\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'company';
  const root = `${slug}-letterhead`;
  const entries = collect(ROOT, root, (r) => r === 'company' || r.startsWith('company/') || r.startsWith('node_modules') || r.startsWith('.') || r.endsWith('.zip'));
  const sk = entries.find((e) => e.name === `${root}/SKILL.md`);
  sk.data = Buffer.from(sk.data.toString('utf8')
    .replace(/^name:.*$/m, `name: ${root}`)
    .replace(/^description:.*$/m, `description: Make letters, declarations and undertakings on the ${config.company.name} letterhead (auto-numbered, with optional signature and seal) and keep that letterhead up to date. Use whenever the user wants a letter, declaration, undertaking or authority letter for ${config.company.name}.`));
  entries.push(...collect(COMPANY, `${root}/company`, (r) => r === 'generated' || r.startsWith('generated/') || r.startsWith('.git') || r === '.DS_Store'));
  const out = path.resolve(outArg || `${root}.zip`);
  writeZip(entries, out);
  console.log(`✓ ${rel(out)}  (${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${entries.length} files)`);
  console.log('  Upload this zip as your skill (replacing the previous one). It contains your signature image, so keep it private.');
}

// A personal skill ships a saved company/ folder. Skill folders are read-only, so copy it next to the work on first use.
function restoreSaved() {
  const saved = path.join(ROOT, 'company');
  if (!FROM_SOURCE && !process.env.LETTERHEAD_COMPANY_DIR && !fs.existsSync(COMPANY) && fs.existsSync(path.join(saved, 'config.json'))) {
    fs.cpSync(saved, COMPANY, { recursive: true });
    console.log('  (restored your saved company profile from the skill into ./company)');
  }
}

// ---------- template preview gallery ----------
function preview(open, outDir, png) {
  const dir = outDir ? path.resolve(outDir) : path.join(OUT, 'preview');
  fs.mkdirSync(dir, { recursive: true });
  const sample = {
    meta: { ref: `${config.refPrefix || 'REF'}/SAMPLE/001`, date: new Date().toISOString().slice(0, 10), to: 'The Branch Manager\nSample Bank, Main Branch\n1 Example Road, City 000000',
      subject: 'Sample letter to preview this template', sign: true, seal: true, enclosures: ['Document A', 'Document B'] },
    body: `Dear Sir / Madam,\n\nThis is a sample letter so you can see how this template looks with real content: spacing, the header and footer, a table, and the signature block.\n\n| Item | Detail |\n|------|--------|\n| Sample row | Sample value |\n| Another row | Another value |\n\nThank you.\n`,
  };
  const cards = [];
  for (const t of listTemplates()) {
    const links = [];
    for (const size of t.sizes.filter((z) => SIZES[z])) {
      const look = resolveLook(t.id, size);
      fs.writeFileSync(path.join(dir, `${t.id}-${size}.html`), renderHtml({ ...sample, meta: { ...sample.meta, template: t.id, size } }, { look }));
      links.push(size);
    }
    cards.push({ t, links });
  }
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(config.company.name)} - Templates</title>
<style>
 body{font:15px/1.5 -apple-system,'Segoe UI',Roboto,sans-serif;margin:0;background:#eef0f4;color:#1f2328}
 main{max-width:1280px;margin:0 auto;padding:28px 20px}
 h1{font-size:20px;margin:0 0 4px} .sub{color:#5b6472;margin:0 0 22px}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:22px}
 .card{background:#fff;border:1px solid #dde1e7;border-radius:10px;padding:16px}
 .card h2{font-size:16px;margin:0 0 2px} .card p{margin:0 0 12px;color:#5b6472;font-size:13px;min-height:58px}
 .thumb{width:100%;aspect-ratio:840/1240;border:1px solid #dde1e7;border-radius:6px;overflow:hidden;position:relative;background:#e6e9ef}
 .thumb iframe{position:absolute;top:0;left:0;width:840px;height:1240px;border:0;transform-origin:0 0;pointer-events:none}
 .links{margin-top:12px} .links a{display:inline-block;margin-right:8px;padding:6px 12px;border-radius:6px;background:#0b5fff;color:#fff;text-decoration:none;font-weight:600;font-size:13px}
 .links a.alt{background:#fff;color:#0b5fff;border:1px solid #0b5fff;padding:5px 11px}
</style></head><body><main>
<h1>${esc(config.company.name)} - Letter templates</h1>
<p class="sub">Sample letter in each look. Click to open full size (with the Print / Save as PDF button). Default: <b>${esc(config.defaultTemplate || 'classic')}</b>. Use one with <code>--template &lt;id&gt;</code>.</p>
<div class="grid">${cards.map(({ t, links }) => `<div class="card"><h2>${esc(t.title)} <span style="color:#8a94a6;font-weight:400">(${esc(t.id)})</span></h2><p>${esc(t.description)}</p>
<div class="thumb"><iframe src="${esc(t.id)}-A4.html" loading="lazy" tabindex="-1" title="${esc(t.title)}"></iframe></div>
<div class="links">${links.map((z, i) => `<a class="${i ? 'alt' : ''}" href="${esc(t.id)}-${z}.html">${z}</a>`).join('')}</div></div>`).join('')}</div>
</main><script>
function fit(){document.querySelectorAll('.thumb').forEach(function(t){t.querySelector('iframe').style.transform='scale('+(t.clientWidth/840)+')'})}
addEventListener('load',fit);addEventListener('resize',fit);
</script></body></html>`);
  console.log(`✓ ${rel(path.join(dir, 'index.html'))}  (${cards.length} templates)`);
  if (png) {
    const chrome = findChrome();
    if (!chrome) console.warn('  ! no Chrome/Edge found, so no PNG previews were made');
    else for (const { t } of cards) {
      const tmp = path.join(os.tmpdir(), `shot-${process.pid}-${t.id}.html`);
      fs.writeFileSync(tmp, fs.readFileSync(path.join(dir, `${t.id}-A4.html`), 'utf8').replace('</head>', '<style>.toolbar{display:none!important}html{background:#fff!important}body{padding:0!important}.sheet{box-shadow:none!important}</style></head>'));
      spawnSync(chrome, ['--headless=new', '--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=794,1123', '--virtual-time-budget=3000', `--screenshot=${path.join(dir, `${t.id}.png`)}`, `file://${tmp}`], { stdio: 'ignore' });
      fs.rmSync(tmp, { force: true });
      console.log(`✓ ${rel(path.join(dir, `${t.id}.png`))}`);
    }
  }
  if (open) openFile(path.join(dir, 'index.html'));
}

// ---------- SVG helpers ----------
// Crop an SVG's viewBox tightly around its drawing (uses headless Chrome's getBBox). For logos and signatures.
function trimSvg(inFile, outFile) {
  const chrome = findChrome();
  if (!chrome) throw new Error('trim-svg needs Chrome/Edge/Brave (set CHROME_PATH).');
  const src = fs.readFileSync(inFile, 'utf8');
  const tmp = path.join(os.tmpdir(), `trim-${process.pid}.html`);
  fs.writeFileSync(tmp, `<!doctype html><body>${src.replace(/<\?xml[^>]*\?>/, '')}<pre id="r"></pre><script>const b=document.querySelector('svg').getBBox();document.getElementById('r').textContent=JSON.stringify([b.x,b.y,b.width,b.height]);</script></body>`);
  const res = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--virtual-time-budget=2000', '--dump-dom', `file://${tmp}`], { encoding: 'utf8' });
  fs.rmSync(tmp, { force: true });
  const m = (res.stdout || '').match(/<pre id="r">(\[[^<]*\])<\/pre>/);
  if (!m) throw new Error('Could not measure the SVG. Is it a valid SVG?');
  const [x, y, w, h] = JSON.parse(m[1]);
  if (!(w > 0 && h > 0)) throw new Error('The SVG has no visible drawing to crop to.');
  const sw = Math.max(0, ...[...src.matchAll(/stroke-width="([\d.]+)"/g)].map((k) => +k[1]));
  const pad = sw / 2 + 0.02 * Math.max(w, h);
  const r = (n) => +n.toFixed(2);
  const vb = [x - pad, y - pad, w + 2 * pad, h + 2 * pad].map(r);
  const out = src.replace(/<svg\b[^>]*>/i, (tag) => tag.replace(/\s(viewBox|width|height)="[^"]*"/g, '').replace(/>$/, ` viewBox="${vb.join(' ')}" width="${vb[2]}" height="${vb[3]}">`));
  fs.writeFileSync(outFile, out);
  console.log(`✓ ${rel(outFile)}  (canvas ${vb[2]} x ${vb[3]}, was ${(src.match(/viewBox="([^"]*)"/) || [, 'unset'])[1]})`);
}

// Problems that make an SVG print badly or are unsafe. Returns { errors: [], warnings: [] }.
function checkSvg(file) {
  const t = fs.readFileSync(file, 'utf8');
  const errors = [], warnings = [];
  if (!/<svg\b/i.test(t)) errors.push('not an SVG file');
  if (/<script\b|\son[a-z]+\s*=/i.test(t)) errors.push('contains script/event handlers; remove them');
  if (!/viewBox=/i.test(t) && !/<svg[^>]*\swidth=/i.test(t)) errors.push('no viewBox or width/height; it will not scale');
  if (/<image\b/i.test(t)) warnings.push('embeds a bitmap (<image>), so it is not a true vector and may print blurry');
  if (/<rect\b[^>]*fill="(#fff(fff)?|white)"/i.test(t)) warnings.push('has a white background rectangle; delete it for a transparent background');
  if (t.length > 1_000_000) warnings.push('file is over 1 MB; simplify it');
  return { errors, warnings };
}

// ---------- doctor ----------
function pngWidth(file) {
  const b = fs.readFileSync(file);
  return b.length > 24 && b.toString('ascii', 1, 4) === 'PNG' ? b.readUInt32BE(16) : null;
}
function doctor() {
  let errors = 0;
  const ok = (m) => console.log(`✓ ${m}`);
  const warn = (m) => console.log(`! ${m}`);
  const bad = (m) => { errors++; console.log(`✗ ${m}`); };

  if (!fs.existsSync(CONFIG_FILE)) { bad('company/config.json not found. Run the /setup-letterhead skill.'); process.exitCode = 1; return; }
  let cfg;
  try { cfg = loadConfig(); ok('company/config.json is valid JSON'); } catch (e) { bad(`company/config.json: ${e.message}`); process.exitCode = 1; return; }

  const c = cfg.company || {};
  for (const k of ['name', 'address']) c[k] ? ok(`company.${k}: ${c[k]}`) : bad(`company.${k} is missing`);
  if (!c.email && !c.phone) warn('no company.email or company.phone: letterheads normally carry contact details');
  for (const k of Object.keys(c.registrations || {})) if (/^LLPNO$/i.test(k)) warn('registration label "LLPNO": the official term is "LLPIN" (check with your CA/CS)');
  if (!Object.keys(c.registrations || {}).length) warn('no company.registrations (LLPIN / CIN / GSTIN etc.). See india-notes.md in the setup skill');

  const logo = cfg.logo && path.resolve(COMPANY, cfg.logo);
  if (!logo || !fs.existsSync(logo)) bad(`logo not found (${cfg.logo}). Put an SVG or PNG in company/assets/`);
  else if (path.extname(logo).toLowerCase() === '.pdf') bad('logo is a PDF. Export as SVG or PNG.');
  else {
    ok(`logo: ${cfg.logo}`);
    if (/\.svg$/i.test(logo)) { const r = checkSvg(logo); r.errors.forEach((m) => bad(`logo: ${m}`)); r.warnings.forEach((m) => warn(`logo: ${m}`)); }
  }

  const people = Object.entries(cfg.signatories || {});
  if (!people.length) warn('no signatories configured');
  for (const [key, p] of people) {
    if (!p.name) warn(`signatory "${key}" has no name`);
    const f = p.signature && path.resolve(COMPANY, p.signature);
    if (!f || !fs.existsSync(f)) { warn(`signatory "${key}": signature file not found (${p.signature}). Letters with sign: true will leave blank space`); continue; }
    if (path.extname(f).toLowerCase() === '.pdf') { bad(`signatory "${key}": signature is a PDF. Export as transparent PNG.`); continue; }
    if (/\.svg$/i.test(f)) {
      const r = checkSvg(f);
      r.errors.forEach((m) => bad(`signatory "${key}": signature ${m}`)); r.warnings.forEach((m) => warn(`signatory "${key}": signature ${m}`));
      if (!r.errors.length) ok(`signature (${key}): ${p.signature} (SVG)`);
      continue;
    }
    const w = path.extname(f).toLowerCase() === '.png' ? pngWidth(f) : null;
    w && w < 500 ? warn(`signatory "${key}": signature image is only ${w}px wide and will print blurry. Use at least 800px or an SVG.`) : ok(`signature (${key}): ${p.signature}`);
  }

  try { ok(`default look: ${resolveLook().id} / ${resolveLook().sizeKey}`); } catch (e) { bad(e.message); }
  ok(`templates: ${listTemplates().map((t) => t.id + (t.custom ? '*' : '')).join(', ')}`);
  findChrome() ? ok('Chrome/Edge found: PDF copies will be created') : warn('no Chrome/Edge found: HTML only (use the Print button for PDFs)');
  fs.existsSync(path.join(COMPANY, '.git')) ? ok('company/ is its own git repo') : warn('company/ is not a git repo yet. Run `git init` inside company/ so letters are versioned (keep it private!)');
  FONT_DIR && fs.existsSync(path.join(FONT_DIR, 'carlito-latin-400-normal.woff2')) ? ok('fonts found') : bad('fonts missing (expected a fonts/ folder next to the engine, or run `npm install` in the repo)');

  console.log(errors ? `\n${errors} problem(s) to fix.` : '\nAll good.');
  if (errors) process.exitCode = 1;
}

// ---------- CLI ----------
const { values: v, positionals: files } = parseArgs({
  allowPositionals: true,
  options: {
    new: { type: 'boolean' }, blank: { type: 'boolean' }, all: { type: 'boolean' }, templates: { type: 'boolean' },
    doctor: { type: 'boolean' }, approve: { type: 'boolean' }, pack: { type: 'boolean' }, force: { type: 'boolean' }, index: { type: 'boolean' }, 'trim-svg': { type: 'boolean' }, preview: { type: 'boolean' }, png: { type: 'boolean' }, out: { type: 'string' }, open: { type: 'boolean' }, 'no-pdf': { type: 'boolean' },
    template: { type: 'string' }, size: { type: 'string' },
  },
});
const opts = { open: v.open, pdf: !v['no-pdf'], template: v.template, size: v.size };

try {
  if (v['trim-svg']) {
    if (!files[0]) throw new Error('Usage: npm run trim-svg -- <in.svg> [out.svg]');
    trimSvg(path.resolve(files[0]), path.resolve(files[1] || files[0].replace(/\.svg$/i, '.trimmed.svg')));
  } else if (v.doctor) {
    restoreSaved();
    doctor();
  } else if (v.templates) {
    for (const t of listTemplates()) console.log(`${t.id.padEnd(8)} ${t.title}${t.custom ? ' (company)' : ''}: ${t.description}\n         sizes: ${t.sizes.join(', ')}`);
  } else {
    restoreSaved();
    loadConfig();
    if (v.pack) {
      pack(files[0]);
    } else if (v.approve) {
      if (!files[0]) throw new Error('Usage: npm run approve -- <letter-name>   e.g. 2026-11-23-my-letter');
      approve(files[0], v.force);
    } else if (v.preview) {
      preview(v.open, v.out, v.png);
    } else if (v.new) {
      if (!files[0]) throw new Error('Usage: npm run new -- <slug> [--template X] [--size A4|A5]');
      scaffold(files[0], v.template, v.size);
    } else if (v.blank) {
      build(null, { ...opts, blank: true });
    } else if (v.index) {
      buildIndex(); console.log('✓ company/generated/index.html'); if (v.open) openFile(path.join(OUT, 'index.html'));
    } else if (v.all) {
      fs.readdirSync(LETTERS).filter((f) => f.endsWith('.md')).forEach((f) => build(path.join(LETTERS, f), opts));
    } else if (files.length) {
      files.forEach((f) => build(path.resolve(f), opts));
    } else {
      console.log('Usage: npm run letter -- company/letters/<file>.md [--open] [--no-pdf] [--template X] [--size A5]\n       npm run new -- <slug> [--template X] [--size A5]\n       npm run doctor | templates | preview | blank | all | index | approve | trim-svg');
    }
  }
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
