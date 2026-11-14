# AGENTS.md

This is a public, MIT-licensed repository: IPF GL, DOTS and Wilks scores in a
dependency-free TypeScript module, plus the embeddable calculator widget.

- Everything here is public, including commit messages, pull requests, and
  issues. Keep credentials, private URLs, internal notes, and anything about
  other Brolic repositories out of them.
- Commit messages and pull request descriptions describe the change only, with
  no tool or co-author attribution lines.
- brolic.app serves a copy of this code. Make changes here first; the site
  picks them up from this repository.
- Keep `src/scores.ts` free of runtime dependencies.
- Run `npm run verify` (typecheck, tests, build) before opening a pull
  request. Work on a branch and land through a pull request; the owner merges.
