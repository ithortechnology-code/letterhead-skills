# Letterhead

Local, agent-driven letterhead and letter generator. No server, no cloud. A user chats with Claude; Claude writes
Markdown letters and builds self-contained HTML (with a Print / Save as PDF button) plus an optional PDF copy.

## Layout

- `src/`, `templates/`, `starter/`, `.claude/skills/`: the **engine**. Generic and public. Company-agnostic. Don't put any company's data here.
- `company/`: **everything specific to one company**: `config.json`, `assets/` (logo, signature), `letters/*.md`,
  `out/` (HTML + PDF + `index.html`), optional `templates/` (company-specific looks).
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
- Assets must be SVG or PNG (transparent background). PDFs are not supported.
- Printing: A4/A5 at Scale 100%, Margins "Default", Headers and footers off. Never "Fit to page".

## Commands

```
npm run doctor                                      check setup
npm run templates                                   list looks and sizes
npm run new -- <slug> --template X --size A5        new letter (auto ref number)
npm run letter -- company/letters/<f>.md [--open] [--no-pdf]
npm run all | blank | index
```
Needs Node 20+. PDF copies need Chrome/Edge/Brave (set `CHROME_PATH` if installed elsewhere); without it you still get the HTML.
