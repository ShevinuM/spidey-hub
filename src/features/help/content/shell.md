---
label: Shell & sessions
hint: type in any pane
order: 5
rows:
  - name: cd
    keys:
      - cd <path>
    desc: Changes directory — relative, or absolute with a leading /.
  - name: ls
    keys:
      - ls [path]
    desc: Lists a directory's contents; defaults to the current directory.
  - name: cat
    keys:
      - cat <path>
    desc: Prints a file's contents.
  - name: pwd
    keys:
      - pwd
    desc: Prints the current directory.
  - name: tree
    keys:
      - tree
    desc: Prints the current directory as a tree, three levels deep.
  - name: clear
    keys:
      - clear
    desc: Clears the scrollback.
  - name: whoami
    keys:
      - whoami
    desc: Prints the current user.
  - name: help
    keys:
      - help
    desc: Lists every shell command.
  - name: view-names
    keys:
      - view-names
    desc: Lists the programs you can launch.
  - name: Launch a program
    keys:
      - <name>
    desc: Relaunches that program in the current pane.
  - name: open
    keys:
      - open <view>
    desc: Relaunches a program in this pane, or attaches and jumps to it from the host shell.
  - name: vim
    keys:
      - vim
      - vi
      - nvim
    desc: Opens a file read-only in the editor; :q returns to the shell.
  - name: neofetch
    keys:
      - neofetch
    desc: Prints a small system-info card.
  - name: sudo
    keys:
      - sudo <...>
    desc: Always refuses — nothing is ever run.
  - name: exit
    keys:
      - exit
    desc: Closes this pane — the last one closes the window, then the session.
  - name: reboot
    keys:
      - reboot
    desc: Resets the whole client and starts over.
  - name: tmux ls
    keys:
      - tmux ls
    desc: Lists every session, from any shell.
  - name: tmux new
    keys:
      - tmux new [-s <name>]
    desc: Creates and attaches a session — host shell only.
  - name: tmux attach
    keys:
      - tmux a
      - tmux attach
    desc: Attaches the most recent session, or one by name — host shell only.
  - name: edith
    keys:
      - edith
    desc: Reattaches the default session, from the host shell.
  - name: logout
    keys:
      - exit
    desc: On the host shell, prints a logout message and reloads the page.
---
