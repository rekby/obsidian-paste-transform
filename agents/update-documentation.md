# Update Documentation

Instructions for updating `README.md` and `agents/*.md` after code changes.

## Procedure

1. Read the current `README.md`.
2. Read the current `agents/*.md`.
3. Run `git diff master...HEAD` to see all changes in the current branch.
4. Determine which sections of each document are affected by the diff.
5. Make minimal, targeted edits to affected sections only.

## README Structure

The current `README.md` has the following sections (in order):

1. **Header** — project name and one-line description
2. **Usage** — paste example with screenshot
3. **Settings** — screenshot of settings page
4. **Transform rules** — regex rules explanation, links to MDN docs
5. **JavaScript execution rules** — `ctx` object API (`foundText`, `match`, `debug`), code examples (simple, capture groups, async/fetch, debug mode)
6. **Try result** — test textarea description
7. **Resize text area** — UI hint
8. **Installation** — community plugins link + manual installation
9. **Versioning** — `0.X.Y` scheme explanation

## Architecture Doc Structure

See [agents/architecture.md](architecture.md). It covers: file structure, key types/classes, data flow, build/scripts, CI/CD, default rules. Also see the "How to Update This Document" section at the bottom of that file.

## When to Update

- New feature or setting added
- Existing feature behavior changed
- Script context API (`ctx`) changed (new properties, renamed fields)
- New rule type added
- Default rules changed
- Installation process changed
- Version scheme changed
- Files added/removed, types renamed/split/merged
- Build or CI config changed

## Rules

- Keep the existing tone in README: informal, concise, with code examples where appropriate.
- Keep the same structure and detail level in architecture doc.
- If UI changed, note that screenshots (`attachements/` folder) may need updating, but do not generate screenshots.
- Do not rewrite unchanged sections.
- Do not change formatting style or add/remove sections unless the feature requires it.
- Do not add agent-specific comments or metadata to documentation files.
