---
name: setup-letterhead
description: One-time setup of a company's letterhead. Interviews the user for company details, checks logo and signature files, writes company/config.json, makes the letterhead templates, and sets up the private company repo. Use when company/config.json is missing, when the user says "set up", "create our letterhead", or wants to change company details, colours or template.
---

# Set up a company letterhead

Goal: a working `company/` folder (config, assets, private git repo) and a letterhead the user has approved by eye.
Be conversational and short. Ask for several things at once, not one by one. Never invent company data.

## 0. Check the state
- Run `npm install` if `node_modules/` is missing, then `npm run doctor`.
- If `company/config.json` already exists, read it, show the user a one-line summary, and ask what they want to change
  instead of starting over.

## 1. Collect details (one message)
Ask for, and wait for answers:
1. **Legal name** exactly as registered (including "LLP" / "Private Limited").
2. **Entity type** (LLP, Pvt Ltd, Public Ltd, Partnership, Proprietorship, other). Read `india-notes.md` in this skill's
   folder and tell the user, in a sentence or two, which registration numbers their letters should carry
   (LLPIN, CIN, GSTIN...). Use the correct label ("LLPIN", not "LLPNO"). Say it's general guidance to confirm with their CA/CS.
3. **Registered office address**, **email**, **phone**, **website** (optional).
4. **Registration numbers** (those relevant to the entity).
5. **Authorised signatory**: full name, designation (and role text if not "Authorised Signatory").
6. **Reference prefix** (short, e.g. company initials) and numbering: financial year (April–March, default), calendar year, or none.
7. **Default place** shown on letters (usually the city of the registered office).
8. **Seal**: which do they use: none, round company seal, square signatory stamp ("For <company> / Director / Authorised Signatory"), or both? (Optional by law; see notes.) Round: centre / sub-text (e.g. city). Square: the lines under the blank space (e.g. "Director", "Authorised Signatory"), and whether the printed name goes in it. Set `seal.shape` (`round` | `square` | `both`) and `seal.square.bottom` / `showName`. For LLPs use "Designated Partner" rather than "Director".
9. **Brand colour** (hex, or "pick from my logo").

## 2. Assets
Tell the user to put these in `company/assets/` (create it if needed) and wait until they confirm:
- `logo.svg` (best) or `logo.png`: transparent background, tightly cropped (little empty space around the mark).
- `signature.svg` (preferred) or `signature.png`: transparent background. Skip if the company doesn't want signature images.
  Walk the user through `signature-svg.md` (in this skill's folder): get an SVG from a free AI tool or by tracing their scan,
  save it, run `npm run trim-svg`, then `npm run doctor`. Say plainly that an AI redraw is an approximation and that
  banks/authorities comparing against a specimen need a faithful trace or a clean scan of the real signature.
  For PNG, at least 800 px wide, cropped tight.
PDF files are not supported. Ask for SVG/PNG instead. If the logo SVG has lots of empty space, run `npm run trim-svg -- <in> <out>` to crop it (keep the original in `company/assets/source/`).
For "pick from my logo": read the SVG's fill colours and propose the strongest one as `brand.accent`.

## 3. Write the config
`mkdir -p company/assets company/letters company/generated company/approved` and copy `starter/START-HERE.md` to `company/START-HERE.md`, copy `starter/config.example.json` to `company/config.json`, and
fill in every field from the answers (keep the structure; `registrations` is an ordered label → value map shown in the
header and footer). Remove fields that don't apply. Then `npm run doctor` and fix anything it reports.

## 4. Generate and review the templates
- `npm run preview -- --open` builds a sample letter in every template and size and opens a gallery in the browser.
  Ask the user which look they prefer. (`npm run blank` makes empty letterheads, but `stationery` has no header so looks empty.)
- Check the result yourself first: header fits on one line, logo not tiny, nothing clipped. If it is wrong, adjust
  `company/config.json` (colours, text) before touching CSS.
- Custom design requests ("make the header bigger", "put the logo on the right"): copy the closest built-in template to
  `company/templates/<new-id>/` (with a `template.json` having `title`, `description`, `sizes`), edit that CSS, and
  rebuild. Never edit `templates/` or `src/` for one company's look. Verify with a rendered preview.
- Set `defaultTemplate` / `defaultSize` in the config to the user's choice.

## 5. Make a sample, then set up the private repo
- Create a sample letter with `/new-letter` rules (recipient "Sample Recipient", `sign: true`, `seal` per their choice) so
  they can see signature and seal in place. Delete the sample's `.md` and outputs afterwards so numbering starts at 001.
- `company/` must be its own **private** git repo: if `company/.git` is missing, run `git init -b main` inside it.
  Tell the user to create a **private** remote and push there. Do not create or push remotes without being asked.
  Explain: the signature image lives in this repo, so access should be limited to people allowed to issue letters.
- Confirm the parent (engine) repo ignores `company/` (it does by `.gitignore`; check with `git check-ignore company`).

## 6. Hand over
Summarise in 5 lines what exists and how to make a letter: "Just tell me who it's for and what it should say, e.g.
'a letter to the bank manager asking for ...'". Mention the `index.html` archive in `company/generated/` and the print tip
(Margins Default, Scale 100%, Headers and footers off).
