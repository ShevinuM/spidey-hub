---
label: tmux prefix
hint: Ctrl-b, then a key
order: 2
rows:
  - name: Jump to window
    keys:
      - C-b
      - "1"
      - "2"
      - "3"
      - "4"
      - "5"
    desc: Switches straight to Repositories, Employment Records, Retina-V, Profile, or Help.
  - name: Next window
    keys:
      - C-b
      - n
    desc: Moves to the next window, wrapping around.
  - name: Previous window
    keys:
      - C-b
      - p
    desc: Moves to the previous window, wrapping around.
  - name: Dashboard
    keys:
      - C-b
      - "0"
    desc: Jumps straight back to the dashboard.
  - name: new-window
    keys:
      - C-b
      - c
    desc: Opens a new window running a fresh shell.
  - name: detach
    keys:
      - C-b
      - d
    desc: Leaves the session for a fullscreen host shell; reattach any time.
  - name: Help
    keys:
      - C-b
      - "?"
    desc: Opens this help page.
  - name: Cancel the prefix
    keys:
      - C-b
      - Esc
    desc: Nothing happens — the prefix is dropped.
  - name: rename-window
    keys:
      - C-b
      - ","
    desc: Renames the current window; Enter saves, Esc cancels.
  - name: kill-window
    keys:
      - C-b
      - "&"
    desc: Confirms, then closes the window — the last one ends the session.
  - name: kill-pane
    keys:
      - C-b
      - x
    desc: Confirms, then closes the focused pane — the last one closes the window.
  - name: Split vertically
    keys:
      - C-b
      - "|"
      - "%"
    desc: Opens a new pane to the right, focused.
  - name: Split horizontally
    keys:
      - C-b
      - "-"
      - '"'
    desc: Opens a new pane below, focused.
  - name: Next pane
    keys:
      - C-b
      - o
    desc: Cycles focus to the next pane, wrapping.
  - name: last-pane
    keys:
      - C-b
      - ;
    desc: Jumps back to the previously-focused pane.
  - name: Directional pane nav
    keys:
      - C-b
      - ←
      - ↓
      - ↑
      - →
    desc: Moves focus to the nearest pane in that direction.
  - name: Next layout
    keys:
      - C-b
      - Space
    desc: Cycles through the preset pane layouts.
  - name: Session picker
    keys:
      - C-b
      - w
    desc: Opens a full-window list of every session and window.
  - name: send-prefix
    keys:
      - C-b
      - C-b
    desc: Sends a literal Ctrl-b through to the focused pane.
  - name: copy-mode
    keys:
      - C-b
      - "["
    desc: Freezes the pane so you can select and copy its text.
  - name: paste-buffer
    keys:
      - C-b
      - "]"
    desc: Pastes whatever you last copied into the focused text input.
---
