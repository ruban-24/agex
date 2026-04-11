---
name: release
description: Prepare and ship agex releases. Use when the maintainer says "release", "bump version", "cut a release", "ship it", "tag a release", or wants to publish a new version. Accepts an optional bump type argument (e.g., `/release patch`, `/release minor`, `/release major`). This skill is for the repo maintainer only — contributors should not use it.
---

# Release

Ship a new version of agex. This skill bumps the version, generates a changelog from commits since the last release, rebuilds, commits, tags, and pushes — which triggers the CI pipeline to publish to npm, create a GitHub Release, and update the Homebrew formula.

## Prerequisites

- You must be on the `main` branch. If not, stop and say so.
- Working tree should be clean. Check with `git status --porcelain`. If dirty, ask the user if they want to continue — a release tag should point to a clean state.

## Step 1: Determine bump type

If the user specified a bump type as an argument (e.g., `/release patch`), use it. Otherwise, ask:

> What type of release is this?
> - **patch** — bug fixes, performance improvements, small changes
> - **minor** — new features, non-breaking additions
> - **major** — breaking changes

## Step 2: Bump the version

Read the current version from `package.json` and compute the new version:

- **patch**: `0.3.6` → `0.3.7`
- **minor**: `0.3.6` → `0.4.0`
- **major**: `0.3.6` → `1.0.0`

Edit the `"version"` field in `package.json` directly. Do not use `npm version` — it creates tags and commits on its own.

## Step 3: Generate the changelog entry

Get all commits since the last release tag:

```bash
git describe --tags --abbrev=0   # find latest v* tag
git log <latest-tag>..HEAD --oneline
```

Draft a changelog entry from these commits. Follow the format already established in `CHANGELOG.md`:

```markdown
## <version> — <YYYY-MM-DD>

### <Category>

- **Bold title:** Description of the change
- **Another change (#issue):** Description referencing a GitHub issue
```

**Categories** (use only the ones that apply, in this order):

1. `### Breaking Changes` — API changes, removed features, renamed commands
2. `### Features` — new commands, flags, capabilities
3. `### Bug Fixes` — corrections to existing behavior
4. `### Performance` — speed, memory, or resource improvements
5. `### Improvements` — enhancements to existing features, DX improvements

Each bullet starts with a **bold title** followed by a colon and description. Reference GitHub issues with `(#N)` when relevant. Group related commits into single entries rather than listing every commit verbatim — the changelog is for users, not a git log.

Present the draft to the user for review. Let them edit before proceeding.

## Step 4: Update CHANGELOG.md

Insert the new entry at the top of `CHANGELOG.md`, directly after the `# Changelog` header and before the previous version's entry.

## Step 5: Rebuild

The build embeds the version at compile time, so it must be rebuilt after bumping:

```bash
npm run build
```

Verify the version is correct:

```bash
node dist/index.js --version
```

If the output doesn't match the new version, stop — something went wrong with the build.

## Step 6: Commit

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: release v<version>"
```

`dist/` is in `.gitignore` so it won't be staged. This is expected — CI rebuilds from source.

## Step 7: Tag and push

Check that this tag doesn't already exist:

```bash
git tag -l "v<version>"
```

If it exists, stop and tell the user.

Create the tag and push everything:

```bash
git push origin main
git tag "v<version>"
git push origin "v<version>"
```

Tell the user:

> Released `v<version>`. The release workflow is now running:
> https://github.com/ruban-24/agex/actions
>
> It will publish to npm, create a GitHub Release, and update the Homebrew formula.

## Checklist

Before finishing, confirm:

- [ ] On `main` branch
- [ ] `package.json` version is correct
- [ ] `CHANGELOG.md` has the new entry
- [ ] `node dist/index.js --version` matches
- [ ] Tag `v<version>` created and pushed
- [ ] Commit pushed to `origin/main`
