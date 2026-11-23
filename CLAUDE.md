# Letterhead

Local, agent-driven letterhead and letter generator. No server, no cloud. A user chats with Claude; Claude writes
Markdown letters and builds self-contained HTML (with a Print / Save as PDF button) plus an optional PDF copy.

## Layout

- `src/`, `templates/`, `starter/`, `.claude/skills/`: the **engine**. Generic and public. Company-agnostic. Don't put any company's data here.
- `company/`: **everything specific to one company**: `config.json`, `assets/` (logo, signature), `letters/*.md`,
  `generated/` (every built HTML + PDF + `index.html`), `approved/` (final signed-off copies), `START-HERE.md` (plain-language guide for non-technical users), optional `templates/` (company-specific looks).
  It is gitignored by this repo and meant to be its **own private git repo**.

## Workflows (skills)

- No `company/config.json` yet, or the user wants to change company details/branding: **`setup-letterhead`**.
- The user wants a letter, or to edit/rebuild one: **`new-letter`**.
- `npm run doctor` checks the setup at any time.

## Always-on rules

- **Signature and seal are the Authorised Signatory's identity.** Apply `sign: true` / `seal: true` / `page_marks` only when
  the user explicitly asks or confirms. Default: off (no signature image, blank space for a hand signature).
  Multi-page signing options are in the `new-letter` skill.
- **Never invent facts** (dates, amounts, legal clauses, registration numbers, names). Use `[placeholder]` and say so.
- **Never commit company data to the engine repo.** `company/` stays out of it. Commit letters inside `company/` only, and only when asked.
  Never create or push to a remote without being asked.
- Don't edit `src/` or `templates/` to suit one company. Use `company/config.json`, or a copy under `company/templates/`.
- **Approved copies are final.** Only run `approve` when the user says the letter is approved/final; never edit files in `approved/`. A changed letter after approval is a new letter (new reference).
- Assets must be SVG (preferred) or PNG with a transparent background. PDFs are not supported. `npm run trim-svg` crops an SVG's
  canvas; `npm run doctor` checks assets. See `.claude/skills/setup-letterhead/signature-svg.md` for getting a signature as SVG.
- Printing: paper size A4 (or A5), Scale 100%, Headers and footers off. Margins Default (left/right margins are built into the layout, top/bottom are real page margins). Never "Fit to page". In Safari the paper size must be set to A4 by hand (Safari ignores the page's size).

## Commands

```
npm run doctor                                      check setup
npm run templates                                   list looks and sizes
npm run preview -- --open                           gallery of every template with a sample letter
npm run new -- <slug> --template X --size A5        new letter (auto ref number)
npm run letter -- company/letters/<f>.md [--open] [--no-pdf]
npm run approve -- <letter-name>      copy a reviewed letter into approved/ (refuses placeholders and re-approvals)
npm run all | blank | index | trim-svg
npm run docs        regenerate docs/templates (demo gallery + PNGs, fictional Acme company). Run after changing a template.
```
Needs Node 20+. PDF copies need Chrome/Edge/Brave (set `CHROME_PATH` if installed elsewhere); without it you still get the HTML.
