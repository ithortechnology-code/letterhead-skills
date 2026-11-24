---
name: letterhead
description: Create a company letterhead and generate numbered letters, declarations and undertakings on it, with optional signature, seal and multi-page signing. Use when the user wants a letterhead or letter template for their company, a formal letter, a declaration or undertaking, or to update their letterhead. Produces a self-contained HTML letter (print or save as PDF) and keeps references auto-numbered.
---

# Letterhead and letters (portable edition)

You turn a chat into finished letters on the user's own letterhead. The engine is one script, `scripts/letterhead.mjs`
(run with `node`, relative to this skill's folder). Work in the current working directory: company data lives in
`./company` there. Nothing needs installing.

Be conversational and short. Ask for several things at once. **Never invent** dates, amounts, legal clauses,
registration numbers or names; use what the user gave and mark gaps `[like this]`.

## 0. Check the state
Run `node scripts/letterhead.mjs --doctor`. If `./company/config.json` is missing (and the skill did not restore one),
this is a first-time setup: do section 1. Otherwise go to section 2.

## 1. First-time setup
Ask in one message, then wait:
1. Legal name exactly as registered; entity type (LLP, Pvt Ltd, Partnership, Proprietorship...).
2. Registered address, email, phone, website. Registration numbers that apply (LLPIN, CIN, GSTIN...). Use the right
   label: an LLP's number is the **LLPIN**. See `reference/india-notes.md` and say it is general guidance to confirm with a CA/CS.
3. The authorised signatory: name, designation.
4. A short reference prefix, and numbering by financial year (April to March, default), calendar year, or none.
5. Seal: none, round company seal, square signatory stamp ("For <company> / Director / Authorised Signatory"), or both.
6. Brand colour (hex) or "take it from my logo".
7. Ask them to upload their **logo** (SVG preferred, else PNG; transparent) and, if they want signed letters, their
   **signature** (SVG or PNG, transparent). See `reference/signature-svg.md` for getting an SVG. A PDF is not accepted.

Then: create `company/assets/`, `company/letters/`, `company/generated/`, `company/approved/`; save the uploads into
`company/assets/` as `logo.*` and `signature.*`; copy `starter/config.example.json` to `company/config.json` and fill in
every field (keep the structure; `registrations` is label to value; asset paths are relative to `company/`); copy
`starter/START-HERE.md` to `company/START-HERE.md`. For SVGs with empty space run
`node scripts/letterhead.mjs --trim-svg company/assets/logo.svg company/assets/logo.svg`. Run `--doctor` and fix what it reports.

Show the look: `node scripts/letterhead.mjs --preview` writes `company/generated/preview/index.html` (a sample letter in
each template and size). Give the user that file to open in their browser, ask which they prefer (classic is the default,
no boxes; boxed, modern, plain black-and-white, stationery for pre-printed paper), and set `defaultTemplate` / `defaultSize`.
Custom look requests: copy the closest folder from `templates/` to `company/templates/<name>/`, edit its CSS, preview again.
Then go to section 3 so the setup is saved.

## 2. Making a letter
1. Get recipient, subject and content (ask only for what's missing).
2. `node scripts/letterhead.mjs --new <slug> --template <id> --size A4` creates `company/letters/<date>-<slug>.md` with the
   next reference number. Never type reference numbers by hand.
3. Fill the front matter (`to`, `subject`, `date`, `enclosures`, `cc`) and the Markdown body. **Quote front-matter values
   that contain a colon**, e.g. `subject: "Declaration: ..."`.
4. Signing is **off by default** (blank space for a hand signature). Set `sign: true`, `seal: true|round|square|both`,
   `page_marks: signature|seal|both` (small mark on every page), `page_numbers: true`, `signature_at: marker` with
   `{{signature}}` in the body, and `\pagebreak` for annexures **only when the user asks**. For multi-page letters ask once
   how they want it signed (last page only; small signature on every page plus full on the last; full on the cover page and
   small on the rest; first page only).
5. Build: `node scripts/letterhead.mjs company/letters/<file>.md --no-pdf`. It prints the page count and spare room. For a
   one-page A4 letter aim for **18+ mm spare**; otherwise shorten the text.
   Heed any `!` warning from the build, and if you can render the PDF to an image, look at the logo and signatures in it.
6. Deliver `company/generated/<file>.html` to the user as a file to download and open in a browser. Tell them: press
   **Print / Save as PDF** with paper A4, scale 100%, headers and footers off. If a PDF was also produced
   (`company/generated/<file>.pdf`, only when a browser is available here), give that too.
7. Revisions: edit the same `.md` and rebuild; the reference stays. A change to a letter already sent is a new letter.
8. When the user says it's approved/final: `node scripts/letterhead.mjs --approve <file-name-without-extension>` copies it to
   `company/approved/`. Approved copies are final; never edit them.

## 3. Save everything (do this at the end of every session that changed anything)
This chat's files disappear when it ends. Run `node scripts/letterhead.mjs --pack`, give the user the zip, and tell them to
**upload it as their skill, replacing the old one** (it contains their company details, logo, signature, template choice and
every letter, so the next chat continues the numbering). Warn them the zip contains their signature image: keep it
private and share it only with people allowed to sign for the company.

## Rules
- Signature and seal are the signatory's identity: add them only when the user asks or confirms.
- Affidavits, indemnities and some undertakings need stamp paper or notarisation; a letterhead is not enough. Mention it.
- Assets are SVG (preferred) or PNG with transparent background. Never PDF.
- Do not edit `scripts/`, `assets/`, `fonts/` or the built-in `templates/`. Company-specific looks go in `company/templates/`.
- Everything you say about law is general guidance; the user should confirm with their CA or lawyer.
