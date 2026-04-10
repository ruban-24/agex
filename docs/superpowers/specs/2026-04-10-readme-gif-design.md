# README Demo GIF Design

## Goal

Create a ~25-30 second GIF for the agentpod README that showcases the tool's value to developers who already use AI coding agents. The GIF tells the story from the human's perspective: create isolated tasks, check in anytime with `-H`, pick the winner.

## Audience

Developers already using AI coding agents (Claude Code, Codex, Copilot CLI). They understand the pain of serial, one-at-a-time agent work. They don't need the GIF to explain what an agent is — they need to see "parallel + pick the winner" and seamless worktree isolation.

## Key value props to showcase

1. **Effortless worktree creation** — one command, instant isolation, the agent understands it without confusion
2. **`-H` flag for ad-hoc human monitoring** — peek in anytime with colored terminal output
3. **Automated verification with ✓/✗ prefixes** — see pass/fail at a glance
4. **Compare and decide** — side-by-side table makes the decision obvious
5. **One command to ship** — merge the winner, done

## Technical approach: fake shell

VHS can't run real agentpod commands against a live repo, so we use a fake shell script that pattern-matches commands and prints pre-baked ANSI-colored output. This gives us:

- Deterministic, pixel-perfect output every time
- Easy to iterate on wording, timing, colors
- No repo setup or pre-seeded tasks needed
- Run `vhs demo.tape` and get the same GIF every time

### Files

| File | Purpose |
|------|---------|
| `demo/fake-agentpod.sh` | Shell script that intercepts agentpod commands and prints pre-baked colored output |
| `demo.tape` | VHS tape file — rewritten to use fake shell with tuned timing |
| `docs/demo.gif` | Output GIF (generated, not committed) |

## GIF storyboard (7 beats, ~27 seconds)

### Beat 1-3: Three rapid task creates (~8s)

The fan-out moment. Three creates in quick succession showing instant worktree isolation.

```
$ agentpod task create --prompt "Approach 1: JWT tokens"
✓ Created task a1b2c3 · branch: agentpod/a1b2c3

$ agentpod task create --prompt "Approach 2: session cookies"
✓ Created task d4e5f6 · branch: agentpod/d4e5f6

$ agentpod task create --prompt "Approach 3: OAuth2 flow"
✓ Created task g7h8i9 · branch: agentpod/g7h8i9
```

### Beat 4: Summary with -H (~5s)

The "check in anytime" moment. Shows mixed task states with the `-H` shorthand.

```
$ agentpod summary -H

agentpod · 3 tasks
1 completed · 1 running · 1 failed

┃ ✓  a1b2c3  completed   12.4s  ✓ 3/3  +47 -12 · 4 files   JWT tokens
┃ ▶  d4e5f6  running      8.1s                               Session cookies
┃ ✗  g7h8i9  failed      15.2s  ✗ 1/3  +93 -41 · 14 files   OAuth2 flow
```

### Beat 5: Verify the winner (~4s)

Automated verification — tests, lint, build all pass.

```
$ agentpod verify a1b2c3 -H

a1b2c3 · verification
✓ npm test          (4.2s)
✓ npm run lint      (2.1s)
✓ npm run build     (6.1s)
All 3 checks passed (12.4s total)
```

### Beat 6: Compare all three (~5s)

Side-by-side decision table. The winner is obvious.

```
$ agentpod compare a1b2c3 d4e5f6 g7h8i9 -H

  ID       Status      Checks  Changes  Duration  Prompt
  ──────────────────────────────────────────────────────────
  a1b2c3   completed   ✓ 3/3   +47 -12  12.4s     JWT tokens
  d4e5f6   completed   ✓ 3/3   +31 -8    9.2s     Session cookies
  g7h8i9   failed      ✗ 1/3   +93 -41  15.2s     OAuth2 flow
```

### Beat 7: Merge the winner (~3s)

One command to ship. Satisfying ending.

```
$ agentpod merge a1b2c3 -H
✓ Merged a1b2c3 into main · fast-forward · 3 commits
```

## VHS settings

```
Set FontSize 14
Set Width 1000
Set Height 600
Set Theme "Catppuccin Mocha"
Set Padding 20
```

## Timing guidelines

- Type speed: `@50ms` per character for commands (fast enough to not bore, slow enough to read)
- Pause after output: `1.5-2s` for tables (summary, compare), `1s` for single-line output
- Pause before first command: `1s` (let the terminal settle)
- No comment lines (`# ...`) — the commands speak for themselves

## What we deliberately excluded

- `agentpod init` — setup story belongs in docs, not the GIF
- `agentpod diff` — compare already shows the decision; diff is detail
- `agentpod discard` / `agentpod clean` — merge is the satisfying ending
- Agent execution — audience already uses agents, they don't need to see the agent typing
- Worktree paths in create output — branch name is sufficient, keeps it clean

## Implementation notes

- `demo/fake-agentpod.sh` should be a bash script that reads `$@`, matches against known commands, and `echo -e` the pre-baked ANSI output
- The VHS tape sets `Set Shell "bash"` and `Set Env "PATH" "/path/to/demo:$PATH"` so the fake script intercepts `agentpod`
- Colors should match the actual `--human` formatter output (green for success, red for failure, yellow for running, dim for labels)
- The fake script should be executable and named `agentpod` inside `demo/` so PATH resolution picks it up
