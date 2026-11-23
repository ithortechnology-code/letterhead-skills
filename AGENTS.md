# Agent instructions

This repo is a letterhead and letter generator driven by an AI agent. The full instructions live in:

- [`CLAUDE.md`](CLAUDE.md): layout, always-on rules, commands
- [`.claude/skills/setup-letterhead/SKILL.md`](.claude/skills/setup-letterhead/SKILL.md): one-time company setup
- [`.claude/skills/new-letter/SKILL.md`](.claude/skills/new-letter/SKILL.md): making, revising and approving letters

Read those first. They are plain Markdown and do not depend on any one vendor's tooling. The only requirements are a
shell with Node 20+ (run `npm install` once) and, optionally, Chrome/Edge/Brave for PDF copies.
