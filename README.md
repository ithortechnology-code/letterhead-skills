# Letterhead

Make a proper company letterhead and generate numbered letters by chatting with [Claude Code](https://claude.com/claude-code).
Runs entirely on your machine: no server, no cloud, nothing to host. Built with Indian business letters in mind
(LLPIN / CIN / GSTIN, financial-year numbering, A4/A5), but works for any company.

## How it works

1. **Clone this repo, open it in Claude Code, run `npm install`.**
2. **Say "set up our letterhead".** The `setup-letterhead` skill asks for your company details, asks you to drop
   `logo.svg` and `signature.png` into `company/assets/`, builds three looks (boxed, modern, plain) for you to pick from,
   and creates a private git repo in `company/` for your data.
3. **Then just ask for letters.** "Letter to the bank manager asking to update our signatory, with signature."
   The `new-letter` skill numbers it (`ACME/2026-27/004`), writes it, and opens it in your browser.
   Click **Print / Save as PDF** (Margins: Default, Scale: 100%, Headers and footers: off). A PDF copy is also saved if Chrome/Edge is installed.

## Multi-page and signing
Normal letters carry no signature image. For undertakings and letters with annexures the agent asks how to sign and
supports: signature + seal on the last page, a small signature (and/or seal) on **every** page, signature + seal on the
cover page only or cover page plus initials on the rest, a round company seal and/or a square signatory stamp ("For <company>", signature inside, "Director / Authorised Signatory" below), `\pagebreak` for annexures, and "Page X of Y".
The signature block is always kept with the last paragraph, so it never ends up alone on a page.

## Repo layout

| Path | What | Public? |
|------|------|---------|
| `src/`, `templates/`, `starter/`, `.claude/skills/` | the engine, three templates (A4 + A5), skills | yes |
| `company/` | your `config.json`, logo, signature, letters, generated HTML/PDF | **no**: gitignored here; its own private repo |

Your company data can never be committed to this repo by accident: `company/` is in `.gitignore`.
Update the engine any time with `git pull`; your `company/` folder is untouched.

## Commands
```
npm run doctor                               check your setup
npm run templates                            list looks and sizes
npm run new -- acme-quote --template modern --size A4
npm run letter -- company/letters/<file>.md --open
npm run all | blank | index
```
Custom looks: copy a folder from `templates/` to `company/templates/<name>/` and edit the CSS.

## Security
The signature image lives in your private `company/` repo, so anyone with access can issue letters in that person's name.
Restrict access, and note signature and seal are opt-in per letter (`sign: true`, `seal: true`).

## Disclaimer
The India notes in `.claude/skills/setup-letterhead/india-notes.md` are general guidance, not legal advice.
Confirm requirements for your entity type with your CA or Company Secretary.

## License
MIT. See [LICENSE](LICENSE).
