# "Without agex" — the setup gauntlet for parallel work in git worktrees
# Run: vhs demo-without.tape

Output docs/without-agex.gif

Set FontSize 22
Set Width 960
Set Height 640
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 35ms
Set Shell "bash"

# Set up fake commands + create fake worktree dir so cd works
Hide
Type "export PATH='./demo/without:$PATH' && export PS1='$ ' && mkdir -p .wt/jwt"
Enter
Sleep 500ms
Ctrl+L
Sleep 500ms
Show

Sleep 500ms

# Beat 1: Create worktree — works, verbose
Type "git worktree add .wt/jwt -b feat/jwt"
Enter
Sleep 1.5s

# Beat 2: cd in, run tests — fails (.env not copied)
Type "cd .wt/jwt && npm test"
Enter
Sleep 2.5s

# Beat 3: Fix it manually — copy env, install deps
Type "cp ../../.env . && npm install"
Enter
Sleep 2s

# Beat 4: Try to start dev server — port already in use
Type "npm run dev"
Enter
Sleep 3s
