# "With agex" — parallel AI agent tasks, safely isolated
# Run: vhs demo.tape

Output docs/with-agex.gif

Set FontSize 22
Set Width 960
Set Height 640
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 35ms
Set Shell "bash"

# Set up fake agex, then clear screen
Hide
Type "export PATH='./demo:$PATH' && export PS1='$ '"
Enter
Sleep 500ms
Ctrl+L
Sleep 500ms
Show

Sleep 500ms

# Beat 1-2: Fan out two parallel tasks
Type "agex create --prompt 'JWT auth'"
Enter
Sleep 1.2s

Type "agex create --prompt 'Redis sessions'"
Enter
Sleep 1.2s

# Beat 3: Check status
Type "agex summary -H"
Enter
Sleep 2.5s

# Beat 4: Verify the winner
Type "agex verify a1b2c3 -H"
Enter
Sleep 2.5s

# Beat 5: Review changes
Type "agex review a1b2c3 -H"
Enter
Sleep 3s

# Beat 6: Ship it
Type "agex accept a1b2c3 -H"
Enter
Sleep 2.5s
