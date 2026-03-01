# Create a Pull Request

Step-by-step workflow for preparing and creating a PR in this repository.

## Conventions

- **Default branch**: `master`
- **Branch naming**: descriptive, lowercase with hyphens (e.g. `add-timeout-setting`, `fix-drag-drop`)
- **Commit style**: imperative, lowercase, short single-line messages (e.g. `fixed infinite cancel dialogs`, `add debug mode`)
- **No PR template** exists — write a clear description of what changed and why.

## Steps

### 1. Verify code changes

All functional changes are complete and working locally.

### 2. Build

```bash
npm run build
```

Must pass (type-check via `tsc` + production esbuild bundle).

### 3. Test

```bash
npm test
```

All tests must pass. See [agents/testing.md](testing.md) for details on writing new tests.

### 4. Update documentation

Follow the instructions in [agents/update-documentation.md](update-documentation.md).

### 5. Commit

Commit all changes (code + documentation) following the commit conventions above.

### 6. Push and create PR

```bash
git push -u origin HEAD
gh pr create --title "<descriptive title>" --body "<description of changes>"
```

Target branch: `master`.
