# Releasing agentpod

## Prerequisites (one-time setup)

1. Generate an npm granular access token at https://www.npmjs.com/settings/~/tokens
   - Scope: read & write, limited to `agentpod`
2. Add it as a GitHub repo secret named `NPM_TOKEN`
   - Repo → Settings → Secrets and variables → Actions → New repository secret

## Publishing a Release

```bash
# 1. Make sure you're on main with a clean working tree
git checkout main
git pull

# 2. Bump the version (pick one)
npm version patch   # 0.1.0 → 0.1.1  (bug fixes)
npm version minor   # 0.1.0 → 0.2.0  (new features)
npm version major   # 0.2.0 → 1.0.0  (breaking changes, save for later)

# 3. Push the commit and tag
git push origin main --tags
```

That's it. The `release.yml` workflow will:
- Run typecheck, build, and tests
- Publish to npm
- Create a GitHub Release with auto-generated notes

## Checking the Release

- **GitHub Actions:** https://github.com/ruban-24/agentpod/actions/workflows/release.yml
- **npm:** https://www.npmjs.com/package/agentpod

## Versioning Guide (while pre-1.0)

| Change | Command | Example |
|--------|---------|---------|
| Bug fix | `npm version patch` | 0.1.0 → 0.1.1 |
| New feature / new command | `npm version minor` | 0.1.0 → 0.2.0 |
| Breaking change (rename command, change config format) | `npm version minor` | 0.2.0 → 0.3.0 |

Stay on `0.x` until the CLI surface is stable and you have real users depending on it. Pre-1.0, breaking changes just bump minor.
