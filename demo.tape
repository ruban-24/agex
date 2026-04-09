# VHS demo tape for agentpod
# Run: vhs demo.tape

Output docs/demo.gif

Set FontSize 14
Set Width 1000
Set Height 600
Set Theme "Catppuccin Mocha"
Set Padding 20

Type "# Initialize agentpod in a repo"
Enter
Sleep 500ms

Type "agentpod init --verify 'npm test' --human"
Enter
Sleep 1s

Type "# Create two parallel tasks"
Enter
Sleep 500ms

Type "agentpod task create --prompt 'Approach 1: refactor with JWT' --human"
Enter
Sleep 1s

Type "agentpod task create --prompt 'Approach 2: refactor with sessions' --human"
Enter
Sleep 1s

Type "# List tasks"
Enter
Sleep 500ms

Type "agentpod list --human"
Enter
Sleep 2s

Type "# Execute a command in a task workspace"
Enter
Sleep 500ms

Type@50ms "agentpod task exec <id1> --cmd 'echo \"auth refactored\" > auth.ts && git add . && git commit -m \"refactor auth\"' --wait --human"
Enter
Sleep 2s

Type "# Verify the task"
Enter
Sleep 500ms

Type "agentpod verify <id1> --human"
Enter
Sleep 1.5s

Type "# View the diff"
Enter
Sleep 500ms

Type "agentpod diff <id1> --human"
Enter
Sleep 2s

Type "# Compare tasks side by side"
Enter
Sleep 500ms

Type "agentpod compare <id1> <id2> --human"
Enter
Sleep 2s

Type "# Merge the winner, discard the rest"
Enter
Sleep 500ms

Type "agentpod merge <id1> --human"
Enter
Sleep 1s

Type "agentpod discard <id2> --human"
Enter
Sleep 1s

Type "# Clean up"
Enter
Sleep 500ms

Type "agentpod clean --human"
Enter
Sleep 2s
