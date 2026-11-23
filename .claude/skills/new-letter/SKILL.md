---
name: new-letter
description: Create, revise or rebuild a letter on the company letterhead. Picks a template and size, auto-numbers the reference, writes the letter from the user's description, and builds the HTML (print/Save as PDF) and PDF. Use whenever the user wants a letter, undertaking, declaration, quotation cover note, authority letter, or to edit/re-issue an existing one.
---

# Make a letter

Requires a finished setup. If `company/config.json` is missing, run the `setup-letterhead` skill first.

## Flow
1. **Understand.** Minimum needed: who it's to, subject, and what it should say. Ask only for what is missing and can't be
   sensibly inferred, in one short message. Don't ask about things with defaults (date = today, place, signatory).
2. **Look.** If the user named a template/size, use it. Otherwise use the config defaults and say which you used
   (`npm run templates` lists the options; mention alternatives in one line).
3. **Scaffold:** `npm run new -- <short-slug> --template <id> --size <A4|A5>`.
   Creates `company/letters/YYYY-MM-DD-<slug>.md` with the next reference number. Never type reference numbers by hand.
4. **Write the letter** into that file: fill `to`, `subject`, `date` if not today, `enclosures`, `cc`, and the Markdown body.
5. **Signing.** Default is **no signature image**: the block has the name and blank space for a hand signature
   (right for normal communications). Add signature/seal only when the user asks or confirms. If the letter is more
   than one page, or is an undertaking/declaration/letter with annexures, ask once:
   *"How should it be signed? (a) no signature, (b) signature + seal on the last page, (c) small signature on every page
   and signature + seal on the last, (d) signature + seal on the first/cover page and a small signature on every other page,
   (e) first page only, (f) small signature and seal on every page."* Then use the table below.
6. **Build:** `npm run letter -- company/letters/<file>.md --open`. This writes `company/out/<file>.html` (self-contained,
   has a Print / Save as PDF button), a PDF copy if Chrome/Edge is installed, and refreshes `company/out/index.html`.
7. **Check it.** The build prints the PDF page count. Confirm it fits sensibly (short letter on one page). If it is more
   than one page and the user hasn't said how to sign, ask the signing question now, and turn on `page_numbers: true`.
   Fix wording or suggest A4 over A5 rather than hacking the layout.
8. Tell the user the file path, and remind them: print dialog → Margins "Default", Scale 100%, Headers and footers off.
9. Offer to commit in `company/` (it is a separate git repo): `git -C company add -A && git -C company commit -m "<ref> <subject>"`.
   Only commit/push when asked.

## Signing and multi-page options

**Seal shapes** (`seal:` in front matter; `true` uses `seal.shape` from the config):
- `round`: circular company seal beside the signature.
- `square`: rectangular signatory stamp: "For <company>", blank space with the **signature inside it**, then
  "<designation> / Authorised Signatory" below. With `sign: false` the space stays empty for a hand signature over the stamp.
- `both`: the square stamp with the round seal overlapping its corner.
Ask which the user needs if the config doesn't settle it. The stamp's bottom lines come from the signatory's `designation`
and `role` (or `seal.square.bottom` in the config); `seal.square.showName: true` adds the person's name as well. The stamp has no border by default (as real ones usually don't); `seal.square.border: true` frames it.
Page marks (`page_marks: seal|both`) always use the small round seal.

| User wants | Front matter | Body |
|---|---|---|
| (a) Normal letter, no signature | `sign: false`, `seal: false` (default) | |
| (b) Signature + seal on the **last** page | `sign: true`, `seal: true` | |
| (c) Small signature on **every** page, full signature + seal on the last | `page_marks: signature`, `sign: true`, `seal: true`, `page_numbers: true` | |
| (d) Full signature + seal on the **first/cover** page, small signature on every page | `signature_at: marker`, `sign: true`, `seal: true`, `page_marks: signature`, `page_numbers: true` | cover text, then `{{signature}}`, then `\pagebreak`, then annexures |
| (e) Signature + seal on the first/cover page **only** | `signature_at: marker`, `sign: true`, `seal: true` | cover text, `{{signature}}`, `\pagebreak`, annexures |
| (f) Small signature **and seal** on every page | `page_marks: both` (+ `sign`/`seal` for the last page) | |

Markers in the body (each on its own line): `\pagebreak` forces a new page (annexures, schedules);
`{{signature}}` puts the full signature block at that spot (needs `signature_at: marker`).
Small marks sit bottom-right just above the footer, repeat on every page, and `page_numbers: true` adds "Page X of Y".

Limits to tell the user plainly:
- The small marks print on **every** page, including the one that also has the full block.
- "First page" means the cover text before `{{signature}}`. In a continuously flowing letter the block can't be pinned to
  the bottom of page 1, so for (d)/(e) keep the cover letter to one page and put the rest after a `\pagebreak`.
- The engine keeps the last paragraph together with the signature block, so a signature never sits alone on a page.
  Use `\pagebreak` rather than blank lines to control breaks; tables keep rows whole and headings stay with their text.
- Small marks and seals use the same signature/seal assets, so the same rule applies: only when the user asks.

## Revising
Edit the same `.md` and rebuild; the ref stays. Only issue a new letter (new ref) if the user says it is a new one.
If a letter was already sent and the content changes materially, ask whether to issue a fresh reference.

## Front matter reference
```yaml
ref: ACME/2026-27/004     # auto
date: 2026-11-23          # ISO or free text; omit = today
to: |
  Name / Designation
  Organisation
  Address
subject: ...
template: boxed           # built-ins: boxed | modern | plain (+ any in company/templates)
size: A4                  # A4 | A5
signatory: default        # key in company/config.json → signatories
sign: false
seal: false             # true (shape from config) | round | square | both
page_marks: none         # none | signature | seal | both (every page)
page_numbers: false      # Page X of Y
signature_at: end        # end | marker ({{signature}} in the body)
place: Pune, India        # default from config; false hides it
enclosures: [A, B]
cc: [Name]
closing: Yours faithfully,   # optional line above the signature box
signoff: false               # omit signature block entirely
```
Body is Markdown: paragraphs, lists, tables, bold.

## Writing rules
- **Never invent** dates, amounts, legal clauses, registration numbers or names. Use what the user gave; put `[placeholder]`
  for gaps and tell them. Company facts come from `company/config.json`.
- Professional business English; short and direct unless asked otherwise.
- The long "We, <company>, a company incorporated under…" opening is **not** automatic. Use it only for formal
  undertakings/declarations/submissions to authorities, or when asked.
- Affidavits/indemnities/undertakings often need stamp paper or notarisation. Mention it when relevant; a letterhead alone isn't enough.
