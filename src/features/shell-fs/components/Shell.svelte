<script lang="ts">
  // In-window shell — one instance per pane, plus the detached HOST
  // instance (`mode: "host"`, fullscreen, no status bar) that drives `tmux
  // new`/`attach`/`open <view>` via `onAttach`/`onCreateAndAttach`/
  // `onAttachView` below. Owns the stateful/effectful half of the split
  // with `src/common/lib/shell.ts`: keydown handling, lazy index warm-up
  // (`lib/shell-index.ts`), scroll-to-bottom, and dispatching a resolved
  // `ShellEffect` to Terminal.svelte — shell.ts's own `runCommand` never
  // touches the DOM, fetch, or tmux.ts directly.
  import type { ShellData } from "../../../common/lib/data";
  import type { Pane } from "../../../common/engines/tmux/tmux";
  import {
    backspace,
    formatPrompt,
    historyDown,
    historyUp,
    parseLine,
    resolveCatTarget,
    runCommand,
    typeChar,
    type CatTarget,
    type SessionRosterEntry,
    type ShellEffect,
    type ShellMode,
    type FsEntry,
  } from "../../../common/lib/shell";
  import { loadFsIndex, loadGrepFiles, loadRepoIndex } from "../lib/shell-index";
  import { repoFileText, type TokenSpan } from "../../../common/lib/repo-tree";
  import { pushPasteTarget, removePasteTarget } from "../../../common/lib/paste-targets";
  import { resolvePageEpoch } from "../../../common/lib/clock";
  import { classifyDoc, colorFor, docColors } from "../../../common/lib/docline";
  import Editor, { type EditorLine } from "../../../common/components/editor/Editor.svelte";

  interface Props {
    shell: ShellData;
    pane: Pane;
    mode: ShellMode;
    viewNames: readonly string[];
    session: { name: string; windowCount: number; createdAt: number; attached: boolean };
    /** Every session the client currently knows about (`tmux
     * ls`/`new`/`a`/`attach`'s own validation roster) plus the well-known
     * default session's bare name — threaded through to BOTH pane-mode and
     * host-mode instances alike (`tmux ls` works everywhere), not just the
     * host shell. */
    sessions: SessionRosterEntry[];
    defaultSessionName: string;
    /** Launches `program` in THIS pane (bare view-name commands, `open
     * <view>` in pane mode) — Terminal.svelte's own `launchProgram`. */
    onLaunch: (program: string) => void;
    /** `exit` — pane mode: close this pane (cascades to kill-window on a
     * single-pane window, same fallback `Ctrl-b x` already uses); host
     * mode: prints `logout` then reloads the page. */
    onExit: () => void;
    onReboot: () => void;
    /** `tmux a [-t name]` resolved to an existing session — HOST mode only;
     * undefined/never called from a pane-mode instance (that mode's own
     * `runCommand` never emits this effect there — see shell.ts's own mode
     * gating). */
    onAttach?: (sessionId: string) => void;
    /** `tmux new [-s name]` — HOST mode only, same reasoning as `onAttach`. */
    onCreateAndAttach?: (name: string) => void;
    /** `open <view>` / `edith` — HOST mode only, same reasoning as
     * `onAttach`. */
    onAttachView?: (sessionId: string, view: string, windowExists: boolean) => void;
    /** Whether THIS pane is the window's focused one — gates
     * `data-copy-source` and the `Ctrl-b ]` paste-target registration below
     * so only the focused pane's paste-target id (`shell:${pane.id}`) stays
     * active when multiple shell panes are mounted. Defaults to `true`. */
    isFocused?: boolean;
  }

  const {
    shell,
    pane,
    mode,
    viewNames,
    session,
    sessions,
    defaultSessionName,
    onLaunch,
    onExit,
    onReboot,
    onAttach,
    onCreateAndAttach,
    onAttachView,
    isFocused = true,
  }: Props = $props();

  let fsEntries = $state<FsEntry[] | null>(null);

  /** Warms the fs-index cache at most once per page (module-level cache in
   * `shell-index.ts`); falls back to an empty index on fetch failure so a
   * command still runs, reporting "missing" for everything, rather than
   * hanging. */
  async function ensureFsEntries(): Promise<FsEntry[]> {
    if (fsEntries) return fsEntries;
    try {
      const loaded = await loadFsIndex();
      fsEntries = loaded;
      return loaded;
    } catch {
      fsEntries = [];
      return [];
    }
  }

  /** Pre-fetches whatever `target` implies ("site files from the grep
   * index, repos/<name>/ files from repo index JSONs") and returns a
   * synchronous lookup `runCommand` can call — the
   * ONE place this component reaches into the network for `cat`. */
  async function buildResolveContent(target: CatTarget): Promise<(t: CatTarget) => string | undefined> {
    if (target.kind === "site") {
      const files = await loadGrepFiles().catch(() => []);
      return (t) => (t.kind === "site" ? files.find((f) => f.path === t.path)?.lines.join("\n") : undefined);
    }
    if (target.kind === "repo") {
      const files = await loadRepoIndex(target.repo)
        .then((i) => i.files)
        .catch(() => []);
      return (t) => {
        if (t.kind !== "repo" || t.repo !== target.repo) return undefined;
        const file = files.find((f) => f.path === t.path);
        return file ? repoFileText(file).join("\n") : undefined;
      };
    }
    return () => undefined;
  }

  /** `vim repos/<name>/…` reuses the SAME tokenized lines Repositories' own editor
   * shows for that file (the repo index is already warmed by
   * `buildResolveContent` above by the time this runs) — a site file (`cat`/
   * `vim` over grep-index.json) has no tokens to find and always falls back
   * flat, same as any other cache-miss/fetch-failure this shell tolerates. */
  async function tokensFor(
    target: CatTarget | null,
  ): Promise<{ tokens?: TokenSpan[][] | undefined; palette?: string[] | undefined }> {
    if (!target || target.kind !== "repo") return {};
    try {
      const index = await loadRepoIndex(target.repo);
      const file = index.files.find((f) => f.path === target.path);
      if (!file?.tok) return {};
      return { tokens: file.lines as TokenSpan[][], palette: index.palette };
    } catch {
      return {};
    }
  }

  async function applyEffect(effect: ShellEffect, target: CatTarget | null) {
    if (effect.kind === "launch") onLaunch(effect.program);
    else if (effect.kind === "exit-pane") onExit();
    else if (effect.kind === "reboot") onReboot();
    else if (effect.kind === "attach") onAttach?.(effect.sessionId);
    else if (effect.kind === "create-and-attach") onCreateAndAttach?.(effect.name);
    else if (effect.kind === "attach-view") onAttachView?.(effect.sessionId, effect.view, effect.windowExists);
    else if (effect.kind === "open-editor") {
      const { tokens, palette } = await tokensFor(target);
      editorFile = { path: effect.path, content: effect.content, tokens, palette };
    }
  }

  interface EditorFileState {
    path: string;
    content: string;
    /** Present only for a `vim repos/<name>/…` open whose file generate.mjs
     * tokenized — a plain `cat`/`vim` site-file open never has these (see
     * tokensFor's own comment). */
    tokens?: TokenSpan[][] | undefined;
    palette?: string[] | undefined;
  }
  let editorFile = $state<EditorFileState | null>(null);
  let editorRef = $state<{
    handleKey: (e: KeyboardEvent) => boolean;
    runExCommand: (cmd: string) => { recognized: boolean; error?: string };
  } | null>(null);

  const editorLines = $derived.by((): EditorLine[] => {
    if (!editorFile) return [];
    const lines = editorFile.content.split("\n");
    const isMd = editorFile.path.toLowerCase().endsWith(".md");
    if (isMd) {
      const kinds = classifyDoc(lines, "project");
      return lines.map((raw, i) => ({ n: i + 1, t: raw === "" ? " " : raw, style: colorFor(kinds[i], "project") }));
    }
    if (editorFile.tokens) {
      const tokens = editorFile.tokens;
      return lines.map((raw, i) => ({ n: i + 1, t: raw === "" ? " " : tokens[i], style: docColors.p }));
    }
    return lines.map((raw, i) => ({ n: i + 1, t: raw === "" ? " " : raw, style: docColors.p }));
  });

  const editorPalette = $derived(editorFile?.palette ?? []);

  const editorFileName = $derived(editorFile ? editorFile.path.split("/").pop()! : "");

  function closeEditor() {
    editorFile = null;
    editorRef = null;
  }

  /** Exposed for Terminal.svelte's generic per-pane ref registry — same
   * capability-check contract Repositories.svelte/EmploymentRecords.svelte's own
   * `isEditorOpen` already provides (gates the Ctrl-d/u/f/b scroll chords
   * and picks ex-mode vs. site-mode for the bare `:` fallback opener). */
  export function isEditorOpen(): boolean {
    return !!editorFile;
  }

  /** Forwards to the embedded Editor's own `runExCommand` — Terminal.
   * svelte's site-wide Cmdline box calls this when its ex-mode Enter fires
   * (`:q` here drops back to this shell, never killing the pane). */
  export function runEditorExCommand(cmd: string): { recognized: boolean; error?: string } {
    if (!editorFile || !editorRef) return { recognized: false };
    return editorRef.runExCommand(cmd);
  }

  // `submit()` synchronously clears `pane.shell.input` on Enter before the
  // async index warm-up/fetch starts, and chains that work (`runOneCommand`)
  // onto `pendingSubmit`, a standing promise queue, so a fast second Enter
  // can never race the first command's still-unresolved input or output.
  let pendingSubmit: Promise<unknown> = Promise.resolve();

  function submit() {
    const raw = pane.shell.input;
    pane.shell = { ...pane.shell, input: "", historyIndex: null, draftBeforeHistory: "" };
    pendingSubmit = pendingSubmit.then(() => runOneCommand(raw));
  }

  async function runOneCommand(raw: string) {
    const entries = await ensureFsEntries();
    const { cmd, args } = parseLine(raw);
    let resolveContent: (t: CatTarget) => string | undefined = () => undefined;
    let target: CatTarget | null = null;
    if ((cmd === "cat" || cmd === "vim" || cmd === "vi" || cmd === "nvim") && args[0]) {
      target = resolveCatTarget(entries, pane.shell.cwd, args[0]);
      resolveContent = await buildResolveContent(target);
    }
    const outcome = runCommand(pane.shell, raw, {
      fsEntries: entries,
      resolveContent,
      mode,
      // `nowMs` comes from `resolvePageEpoch()`, never a raw `Date.now()`,
      // so neofetch's uptime matches the session's own frozen `createdAt`
      // under a test-pinned clock.
      nowMs: resolvePageEpoch(),
      session,
      sessions,
      defaultSessionName,
      shell,
      viewNames,
    });
    // `outcome.state` carries `runCommand`'s own reset input/history
    // fields, which would erase anything typed during the preceding
    // `await` — so those three fields are re-read fresh from `pane.shell`
    // instead.
    pane.shell = {
      ...outcome.state,
      input: pane.shell.input,
      historyIndex: pane.shell.historyIndex,
      draftBeforeHistory: pane.shell.draftBeforeHistory,
    };
    await applyEffect(outcome.effect, target);
  }

  /** Consumes printable keys/Enter/Backspace/arrows before grep's `/`
   * opener and the bare `:`/`?` openers — those characters type into the
   * shell instead. Modifier chords fall through untouched. */
  export function handleKey(e: KeyboardEvent): boolean {
    if (editorFile) {
      return editorRef ? editorRef.handleKey(e) : false;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return false;

    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return true;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      pane.shell = backspace(pane.shell);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      pane.shell = historyUp(pane.shell);
      return true;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      pane.shell = historyDown(pane.shell);
      return true;
    }
    if (e.key.length === 1) {
      e.preventDefault();
      pane.shell = typeChar(pane.shell, e.key);
      return true;
    }
    return false;
  }

  $effect(() => {
    const id = `shell:${pane.id}`;
    if (!isFocused) return; // see `isFocused` prop's own doc comment
    pushPasteTarget({
      id,
      insert: (t: string) => {
        pane.shell = { ...pane.shell, input: pane.shell.input + t };
      },
    });
    return () => removePasteTarget(id);
  });

  let scrollerEl: HTMLDivElement | undefined = $state();

  // Auto-scroll on new output: reads `lines.length` and writes only to the
  // DOM node's own `scrollTop`, never back into `pane.shell`, so this is
  // not a read-then-write-same-$state loop.
  $effect(() => {
    const n = pane.shell.lines.length;
    void n;
    if (scrollerEl) scrollerEl.scrollTop = scrollerEl.scrollHeight;
  });

  const promptText = $derived(formatPrompt(mode, shell, pane.shell.cwd));
</script>

{#if editorFile}
  <Editor
    bind:this={editorRef}
    fileName={editorFileName}
    lines={editorLines}
    palette={editorPalette}
    labels={shell.editor}
    breadcrumbLeft={mode === "host" ? "host" : "shell"}
    breadcrumbRight={editorFile.path}
    {isFocused}
    onClose={closeEditor}
  />
{:else}
  <div
    data-shell-mode={mode}
    style="flex:1;min-height:0;display:flex;flex-direction:column;padding:10px 14px;font-size:13px;line-height:1.5;color:#c9d1d9"
  >
    <div
      bind:this={scrollerEl}
      data-testid="shell-scroller"
      data-copy-source={isFocused ? "" : undefined}
      style="flex:1;min-height:0;overflow-y:auto;white-space:pre-wrap;word-break:break-word"
    >
      {#each pane.shell.lines as line, i (i)}
        <div
          data-testid="shell-line"
          style={line.kind === "error"
            ? "color:#e0453c"
            : line.kind === "input"
              ? "color:#5fc6b4"
              : "color:#c9d1d9"}
        >{line.text}</div>
      {/each}
      <div style="display:flex;align-items:baseline;white-space:pre">
        <span data-testid="shell-prompt" style="color:#5fc6b4">{promptText}</span
        ><span data-testid="shell-input">{pane.shell.input}</span
        ><span
          style="display:inline-block;width:7px;height:13px;margin-left:1px;vertical-align:-2px;background:#5fc6b4;animation:blk 1.1s steps(1) infinite"
        ></span>
      </div>
    </div>
  </div>
{/if}
