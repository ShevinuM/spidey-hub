---
label: Command box
hint: ":"
order: 11
rows:
  - name: Open
    keys:
      - ":"
    desc: Opens a small box for jumping to a window or running a command.
  - name: Open (editor)
    keys:
      - ":"
    desc: With a file editor open, the same box also takes :q, :w, and line jumps.
  - name: Open (tmux)
    keys:
      - C-b
      - ":"
    desc: Same box, for tmux-style commands — rename, close, switch, layout.
  - name: Type a command
    keys:
      - a-z
    desc: Appends to the typed command.
  - name: Complete
    keys:
      - Tab
    desc: Completes the command name; press again for the next match.
  - name: Run
    keys:
      - Enter
    desc: Runs the typed command.
  - name: Close
    keys:
      - Esc
    desc: Closes the box without running anything.
---
