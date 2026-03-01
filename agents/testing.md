# Testing

## Quick Start

```bash
npm test          # run all tests
npm run build     # type-check (tsc) + production build (esbuild)
```

Both commands must pass before creating a PR. CI (`test.yml`) runs them automatically on every PR and push to `main`/`master`.

## Framework

- **Jest** with **ts-jest** preset (`jest.config.js`).
- Environment: `node`.
- `forceExit: true` to avoid hanging on background timers from script timeout tests.

## Test Files

| File | What it covers |
|------|---------------|
| `__tests__/advanced.test.ts` | Regex rules, script rules, async scripts, error handling, multiple matches, rule chaining, script timeout notifications, invalid regex patterns, error recovery |
| `__tests__/test-backward-compatibility.ts` | Settings migration from v1 to v2, script security flag behavior (block/allow execution) |

## Mocks

`__mocks__/obsidian.js` provides stubs for Obsidian API classes used by the plugin:
- `Plugin` (with `loadData`/`saveData` stubs)
- `PluginSettingTab`
- `Setting`, `TextAreaComponent`, `DropdownComponent`, `ButtonComponent`, `TextComponent`
- `App`, `Notice`, `setIcon`

`advanced.test.ts` additionally overrides `Notice` with a tracked mock to assert error/timeout notifications.

For tests that need `fetch`, mock it via `global.fetch = jest.fn(...)`.

## How Tests Work

Tests instantiate `PasteTransform` directly with mock app/manifest, call `loadSettings()`, configure `settings.rules`, call `compileRules()`, then assert results of `applyRules(input)`.

Typical pattern:

```typescript
plugin.settings.rules = [
  { pattern: '^test:(.+)$', type: 'replace', replacer: '$1', script: '', enabled: true }
];
plugin.compileRules();

const { changed, result } = await plugin.applyRules('test:abc');
expect(changed).toBe(true);
expect(result).toBe('abc');
```

## Writing New Tests

1. Add tests to existing files or create a new `__tests__/*.test.ts` file.
2. Follow the existing pattern: `beforeEach` with mock setup, configure rules, `compileRules()`, assert `applyRules()`.
3. For script rules, set `plugin.settings.scriptSecurityWarningAccepted = true`.
4. For timeout tests, use `jest.useFakeTimers()` and `jest.runAllTimersAsync()`.
5. For error tests, spy on `console.error` with `mockImplementation(() => {})` to suppress noise.
