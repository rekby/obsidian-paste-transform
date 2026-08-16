# Project Architecture

## Overview

**Paste Transform** is an Obsidian plugin that intercepts paste events and transforms pasted plain text using regex or JavaScript rules.

Repository: `rekby/obsidian-paste-transform`
License: Apache-2.0
Version scheme: `0.X.Y` (X = breaking changes, Y = non-breaking)

## File Structure

```
main.ts                     Main plugin source (single-file plugin, imports script-context.ts)
script-context.ts           ScriptContext class — the `ctx` object passed to script rules
styles.css                  Plugin UI styles (drag-and-drop, test area, rule layout)
manifest.json               Obsidian plugin manifest (id, version, minAppVersion)
versions.json               Plugin version -> minimum Obsidian version mapping
package.json                Dependencies and scripts
tsconfig.json               TypeScript config
esbuild.config.mjs          Build config (esbuild, entry: main.ts -> main.js)
version-bump.mjs            Script for npm version hook (updates manifest.json, versions.json)
jest.config.js              Jest config (ts-jest, node environment)
__mocks__/obsidian.js        Mocks for Obsidian API (Plugin, Setting, Notice, etc.)
__tests__/
  advanced.test.ts           Feature tests (regex, scripts, async, errors, timeouts, chaining)
  paste-clipboard-types.test.ts   onPaste with different clipboard content types
  test-backward-compatibility.ts  Settings migration v1->v2, script security flag
.github/workflows/
  test.yml                   CI: build + test on PR/push to main/master
  publish.yml                Release: manual workflow_dispatch, version bump + GitHub release
```

## Key Types and Classes (main.ts)

| Symbol | Kind | Purpose |
|--------|------|---------|
| `RuleType` | type | `'replace' \| 'script'` |
| `Rule` | interface | Single transform rule: pattern, type, replacer, script, enabled |
| `PasteTransformSettingsV2` | interface | Current settings format: rules[], debugMode, showRuleNotifications, scriptSecurityWarningAccepted |
| `PasteTransformSettingsV1` | interface | Legacy settings (patterns[] + replacers[]), converted on load |
| `ScriptContext` | class | Context passed to script rules: `match`, `foundText`, `selectedText`, `debug` — defined in `script-context.ts` |
| `ReplaceRule` | class | Compiled rule: regex compilation, script execution with timeout, error handling |
| `PasteTransform` | class (default export) | Plugin class: paste event handler, rule application, settings load/save |
| `PasteTransformSettingsTab` | class | Settings UI: security toggle, debug toggle, test area, rules list with drag-and-drop |

## Data Flow

```
Paste event
  -> PasteTransform.onPaste()
     -> Check: plain text only, not already prevented
     -> Synchronous check: any rule matches?
        -> Yes: preventDefault() immediately
     -> applyRules(): sequential rule application
        -> Each rule: executeRule() -> regex replace or script execution
     -> Insert transformed text via editor.replaceSelection()
```

## Build and Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Watch build (esbuild, dev mode with sourcemaps) |
| `npm run build` | `tsc -noEmit -skipLibCheck` + esbuild production build |
| `npm test` | Jest tests |
| `npm version <minor\|patch>` | Bumps version in package.json, manifest.json, versions.json |

## CI/CD

- **test.yml**: Runs on PRs and pushes to `main`/`master`. Steps: checkout -> Node 18 -> `npm ci` -> `npm run build` -> `npm test`.
- **publish.yml**: Manual trigger (`workflow_dispatch`). Inputs: version part (minor/patch), optional release title. Steps: version bump -> build -> push tag -> create GitHub release with `main.js`, `manifest.json`, `styles.css`.

## Default Rules

The plugin ships with 4 default rules (2 enabled, 2 disabled):
1. GitHub repo link -> emoji + repo name (enabled, regex)
2. Wikipedia link -> emoji + article name (enabled, regex)
3. GitHub issue link -> fetch title from API (disabled, script)
4. GitHub PR link -> fetch title from API (disabled, script)

---

## How to Update This Document

This section is for agents that need to keep the architecture doc in sync with the codebase.

**When to update**: new files added/removed, types or classes renamed/split/merged, build or CI config changed, new dependencies added, default rules changed, data flow changed.

**How**:
1. Read the current codebase (start with `main.ts`, `package.json`, file listing).
2. Compare each section above with the actual code.
3. Update only sections that diverged. Do not rewrite unchanged sections.
4. Keep the same structure, table format, and level of detail.
