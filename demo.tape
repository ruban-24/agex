# agex demo — recorded with VHS (https://github.com/charmbracelet/vhs)
# Run: vhs demo.tape

Output docs/demo.gif

Set FontSize 14
Set Width 1000
Set Height 600
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 40ms
Set Shell "bash"

# Silently set up PATH so fake agex is found, then clear screen
Hide
Type "export PATH='./demo:$PATH' && export PS1='$ '"
Enter
Sleep 500ms
Ctrl+L
Sleep 500ms
Show

Sleep 500ms

# Beat 1-3: Fan out three parallel tasks
Type "agex task create --prompt 'Add JWT auth with refresh tokens'"
Enter
Sleep 1.5s

Type "agex task create --prompt 'Refactor session middleware to Redis'"
Enter
Sleep 1.5s

Type "agex task create --prompt 'Fix token expiry race condition'"
Enter
Sleep 2s

# Beat 4: Check in with summary
Type "agex summary -H"
Enter
Sleep 3s

# Beat 5: Verify the winner
Type "agex verify a1b2c3 -H"
Enter
Sleep 2.5s

# Beat 6: Compare all three
Type "agex compare a1b2c3 d4e5f6 g7h8i9 -H"
Enter
Sleep 3s

# Beat 7: Merge the winner
Type "agex merge a1b2c3 -H"
Enter
Sleep 2s
