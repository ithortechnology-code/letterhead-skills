#!/usr/bin/env node
// Builds the distributables:
//   dist/letterhead.mjs        single-file engine (no node_modules needed) used by the Claude Code plugin
//   dist/letterhead-skill.zip  portable skill (SKILL.md + engine + templates + fonts) to upload to Claude.ai / ChatGPT
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { writeZip, collect } from '../src/zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SKILL = path.join(DIST, 'skill', 'letterhead');
fs.rmSync(path.join(DIST, 'skill'), { recursive: true, force: true });
fs.mkdirSync(path.join(SKILL, 'scripts'), { recursive: true });

await build({ entryPoints: [path.join(ROOT, 'src/build.mjs')], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: path.join(DIST, 'letterhead.mjs'), legalComments: 'none', logLevel: 'warning',
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" } }); // some bundled libraries still call require()
console.log(`✓ dist/letterhead.mjs (${(fs.statSync(path.join(DIST, 'letterhead.mjs')).size / 1024).toFixed(0)} KB)`);

const cp = (from, to) => fs.cpSync(path.join(ROOT, from), path.join(SKILL, to), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'portable/SKILL.md'), path.join(SKILL, 'SKILL.md'));
fs.copyFileSync(path.join(DIST, 'letterhead.mjs'), path.join(SKILL, 'scripts/letterhead.mjs'));
cp('src/base.css', 'assets/base.css'); cp('src/screen.css', 'assets/screen.css');
cp('templates', 'templates'); cp('fonts', 'fonts');
cp('starter/config.example.json', 'starter/config.example.json'); cp('starter/START-HERE.md', 'starter/START-HERE.md');
cp('.claude/skills/setup-letterhead/india-notes.md', 'reference/india-notes.md');
cp('.claude/skills/setup-letterhead/signature-svg.md', 'reference/signature-svg.md');

const zip = path.join(DIST, 'letterhead-skill.zip');
const entries = collect(SKILL, 'letterhead');
writeZip(entries, zip);
console.log(`✓ dist/letterhead-skill.zip (${(fs.statSync(zip).size / 1024).toFixed(0)} KB, ${entries.length} files)`);
