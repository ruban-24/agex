## agex

This repo uses agex. The sessionStart hook (`.claude/hooks/session-start.md`) has the enforcement rules — read it if you need a refresher.

When dogfooding: always use the `agex` CLI package, never `node dist/index.js` (running from `dist/` conflicts with build output of tasks you're merging).
