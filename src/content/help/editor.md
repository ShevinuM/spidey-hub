---
label: File editor
hint: read-only
order: 6
rows:
  - name: Move cursor
    keys:
      - ↑
      - ↓
      - ←
      - →
    desc: Moves the cursor by line or column.
  - name: Move cursor (vim)
    keys:
      - h
      - j
      - k
      - l
    desc: Vim-style alternative to the arrow keys.
  - name: Word motions
    keys:
      - w
      - b
      - e
    desc: Jumps forward or back by word.
  - name: Line start / end
    keys:
      - "0"
      - ^
      - $
    desc: Jumps to the start or end of the line.
  - name: Jump to top
    keys:
      - gg
    desc: Jumps to the first line — press g twice quickly.
  - name: Jump to bottom
    keys:
      - G
    desc: Jumps to the last line.
  - name: Half-page scroll
    keys:
      - Ctrl-d
      - Ctrl-u
    desc: Scrolls down or up by half a page.
  - name: Full-page scroll
    keys:
      - Ctrl-f
      - Ctrl-b
    desc: Scrolls down or up by a full page.
  - name: Visual select
    keys:
      - v
      - V
    desc: Starts character or line selection; a motion extends it.
  - name: Yank
    keys:
      - y
      - yy
    desc: Copies the selection, or the current line, to the paste buffer.
  - name: Search in file
    keys:
      - /
      - n
      - N
    desc: Searches the open file and steps through matches.
  - name: Ex commands
    keys:
      - ":"
      - :w
      - :wq
      - :<n>
    desc: A colon command line — :w/:wq show a read-only notice, :<number> jumps there.
  - name: Close
    keys:
      - :q
      - :q!
    desc: Closes the editor — the only way out.
  - name: Close (mouse)
    keys:
      - click [:q]
    desc: Same as :q — click the pill to close.
  - name: Editing keys
    keys:
      - i
      - a
      - o
      - c
      - d
      - x
      - p
    desc: Every editing key shows a read-only notice and changes nothing.
---
