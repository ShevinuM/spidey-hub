---
label: Repositories
hint: window 1
order: 3
rows:
  - name: Focus a panel
    keys:
      - "0"
      - "1"
      - "2"
      - "3"
      - "4"
      - "5"
    desc: Switches focus between panels [0] Status, [1] Repositories, [2] Files, [3] Content, [4] Commits, [5] Command Log.
  - name: Move selection
    keys:
      - ↑
      - ↓
    desc: Moves the highlighted row within the focused panel.
  - name: Load a repo
    keys:
      - Enter
      - click
    desc: Loads the highlighted repo's file tree into panel [2].
  - name: Preview a file
    keys:
      - click
    desc: Shows the file's contents in panel [3] without opening the editor.
  - name: Open a file
    keys:
      - Enter
    desc: Opens the highlighted file in the full-screen editor.
  - name: Expand / collapse
    keys:
      - click
      - Enter
    desc: Toggles a directory open or closed in panel [2].
  - name: Load a commit
    keys:
      - click
      - Enter
    desc: Loads that commit's snapshot into panel [2].
  - name: Open on GitHub
    keys:
      - o
    desc: Opens the highlighted commit on GitHub, in a new tab (panel [4]).
---
