---
label: Grep
hint: search everything
order: 8
rows:
  - name: Open
    keys:
      - /
    desc: Opens the search box, from anywhere.
  - name: Type a query
    keys:
      - a-z
      - 0-9
    desc: Appends to the search text.
  - name: Edit query
    keys:
      - Backspace
    desc: Removes the last character.
  - name: Clear query
    keys:
      - Ctrl-u
      - Ctrl-w
    desc: Clears the whole search box.
  - name: Next / previous hit
    keys:
      - ↓
      - ↑
    desc: Steps through the matching results.
  - name: Open a hit
    keys:
      - Enter
    desc: Opens the selected result, switching windows if it belongs to one.
  - name: Close
    keys:
      - Esc
      - Ctrl-c
    desc: Closes the search box without navigating anywhere.
---
