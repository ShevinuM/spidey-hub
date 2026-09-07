---
label: Copy mode
hint: Ctrl-b [
order: 7
rows:
  - name: Move cursor
    keys:
      - h
      - j
      - k
      - l
      - ↑
      - ↓
      - ←
      - →
    desc: Moves the cursor over the frozen pane text.
  - name: Jump to top / bottom
    keys:
      - gg
      - G
    desc: Jumps to the first or last line.
  - name: Page scroll
    keys:
      - Ctrl-d
      - Ctrl-u
    desc: Scrolls down or up by half a page.
  - name: Select
    keys:
      - v
    desc: Starts (or cancels) a text selection.
  - name: Copy
    keys:
      - y
      - Enter
    desc: Copies the selection (or current line) and exits copy mode.
  - name: Exit
    keys:
      - q
      - Esc
    desc: Leaves copy mode without copying anything.
---
