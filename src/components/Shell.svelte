<script lang="ts">
  // In-window shell (PLAN.md Iteration 3 Phase 4 items 4.2/4.3) — one
  // instance per shell PANE (`bind:this` registered into PaneTree's ref
  // registry, same contract every other program component uses). A
  // program's `:q` drops its pane's `program` to "shell" (src/lib/tmux.ts's
  // `exitProgram`); this component then renders whatever that pane's own
  // `Pane.shell` buffer holds. Designed to ALSO serve as Phase 5's detached
  // HOST shell (`mode: "host"`, fullscreen, no status bar) without rework —
  // only `mode` threads through today; host-only behavior (tmux new/attach
  // actually working, `open <view>`/bare-name attaching instead of
  // launching) lands in Phase 5.
  //
  // Owns exactly the stateful/effectful half of the split with src/lib/
  // shell.ts: keydown handling, the lazy fetch+cache of the generated fs/
  // grep/repo indexes (src/lib/shellIndex.ts), scroll-to-bottom, and
  // dispatching a resolved `ShellEffect` (launch/exit-pane/reboot) to
  // Terminal.svelte via props — shell.ts's own `runCommand` never touches
  // the DOM, fetch, or tmux.ts directly.
  //
  // Svelte 5 hazard (PLAN.md Risks): the async index-warming work never
  // lives inside an `$effect` that also reads `pane.shell` — it's triggered
  // directly from the Enter-key handler (`submit()`, an ordinary async
  // event handler), which reads `pane.shell.input` once up front and writes
  // the result back exactly once at the end. The one real `$effect` below
  // (auto-scroll) only reads `pane.shell.lines.length` and writes to a DOM
  // node's `scrollTop` — never back into `pane.shell` — so there is no
  // read-then-write-the-same-$state loop.
  import type { ShellData } from "../lib/data";
  import type { Pane } from "../lib/tmux";
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
    type ShellEffect,
    type ShellMode,
    type FsEntry,
  } from "../lib/shell";
  import { loadFsIndex, loadGrepFiles, loadRepoFiles } from "../lib/shellIndex";
  import { pushPasteTarget, removePasteTarget } from "../lib/pasteTargets";
  import { resolvePageEpoch } from "../lib/clock";

  interface Props {
    shell: ShellData;
    pane: Pane;
    mode: ShellMode;
    viewNames: readonly string[];
    session: { name: string; windowCount: number; createdAt: number; attached: boolean };
    /** Launches `program` in THIS pane (bare view-name commands, `open
     * <view>` in pane mode) — Terminal.svelte's own `launchProgram`. */
    onLaunch: (program: string) => void;
    /** `exit` — pane mode: close this pane (cascades to kill-window on a
     * single-pane window, same fallback `Ctrl-b x` already uses); host
     * mode's own `logout` + reload lands in Phase 5. */
    onExit: () => void;
    onReboot: () => void;
  }

  const { shell, pane, mode, viewNames, session, onLaunch, onExit, onReboot }: Props = $props();

  let fsEntries = $state<FsEntry[] | null>(null);

  /** Warms the fs-index cache at most once per page (module-level cache in
   * shellIndex.ts) — called from `submit()` directly, never from an
   * `$effect` (see file header). Falls back to an empty index on fetch
   * failure so a command still runs (reporting "missing" for everything)
   * rather than hanging. */
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

  /** Pre-fetches whatever `target` implies (PLAN.md Architecture notes:
   * "site files from the grep index, repos/<name>/ files from repo index
   * JSONs") and returns a synchronous lookup `runCommand` can call — the
   * ONE place this component reaches into the network for `cat`. */
  async function buildResolveContent(target: CatTarget): Promise<(t: CatTarget) => string | undefined> {
    if (target.kind === "site") {
      const files = await loadGrepFiles().catch(() => []);
      return (t) => (t.kind === "site" ? files.find((f) => f.path === t.path)?.lines.join("\n") : undefined);
    }
    if (target.kind === "repo") {
      const files = await loadRepoFiles(target.repo).catch(() => []);
      return (t) => (t.kind === "repo" && t.repo === target.repo ? files.find((f) => f.path === t.path)?.lines.join("\n") : undefined);
    }
    return () => undefined;
  }

  function applyEffect(effect: ShellEffect) {
    if (effect.kind === "launch") onLaunch(effect.program);
    else if (effect.kind === "exit-pane") onExit();
    else if (effect.kind === "reboot") onReboot();
  }

  // Enter-key submission is fire-and-forget from handleKey's own
  // perspective (a keydown handler can't be awaited by its caller), but its
  // OWN work — warming the fs/grep/repo index caches, and for `cat`,
  // fetching whatever content that implies — is genuinely async. Left as a
  // single `await`-laden function called directly on every Enter, a user
  // (or, more reliably, a fast scripted test) typing a SECOND command
  // before the FIRST command's fetch resolves would race: the next
  // keystrokes land in `pane.shell.input` while it's still holding the
  // first command's un-cleared text, garbling the two together, and by the
  // time either `runCommand` call finally reads `pane.shell` its history/
  // lines/cwd may already reflect the OTHER command's not-yet-applied (or
  // already-applied-out-of-order) effects.
  //
  // Fixed with two changes: (1) `submit()` itself is synchronous and
  // clears `pane.shell.input` (and the history-browsing fields) IMMEDIATELY
  // on Enter, before any fetch even starts — nothing can ever type into or
  // re-observe the command that was just submitted; (2) the actual async
  // work (`runOneCommand`) is chained onto `pendingSubmit`, a standing
  // promise queue — so however fast Enter is pressed again, each
  // submission's `runCommand` call only ever runs after the previous one
  // has fully applied its result to `pane.shell`, preserving real-shell
  // ordering (echo/output always appends in the order commands were
  // submitted, never interleaved or dropped).
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
    if (cmd === "cat" && args[0]) {
      const target = resolveCatTarget(entries, pane.shell.cwd, args[0]);
      resolveContent = await buildResolveContent(target);
    }
    const outcome = runCommand(pane.shell, raw, {
      fsEntries: entries,
      resolveContent,
      mode,
      // Determinism rules (PLAN.md Iteration 3 Phase 4): "neofetch uptime
      // derives from the clock module" — NOT a raw Date.now() read. With a
      // test-pinned CLOCK_EPOCH_STORAGE_KEY, this resolves to the exact same
      // value as the session's own `createdAt` (also `resolvePageEpoch()`,
      // read once at client-factory/reboot time), so uptime is always "0
      // min" under a frozen page clock — deterministic, not a live tick.
      nowMs: resolvePageEpoch(),
      session,
      shell,
      viewNames,
    });
    // `runCommand` always forces `input`/`historyIndex`/`draftBeforeHistory`
    // back to their "just submitted" values (""/null/"") as part of
    // building its own result — correct for the command IT was given, but
    // this call only reaches here after an `await` (warming the fs/repo
    // index caches), during which the user may already have typed the
    // START of their NEXT command into `pane.shell.input`. Blindly taking
    // `outcome.state` wholesale would silently erase those already-typed
    // characters the instant this (delayed) result lands. `pane.shell` is
    // read fresh here — nothing async separates this line from
    // `runCommand`'s own read of it above, so it reflects the exact same
    // live input `runCommand` was just called with, harmlessly re-applied.
    pane.shell = {
      ...outcome.state,
      input: pane.shell.input,
      historyIndex: pane.shell.historyIndex,
      draftBeforeHistory: pane.shell.draftBeforeHistory,
    };
    applyEffect(outcome.effect);
  }

  /** Delegation contract (PLAN.md Architecture notes): consumes printable
   * keys/Enter/Backspace/arrows BEFORE grep's `/` opener and the bare-`:`/
   * `?` openers — `:`/`?`/`/` all type into the shell like any other
   * character. Modifier chords (Ctrl-b prefix, etc.) fall through
   * untouched, same convention every other ref uses. */
  export function handleKey(e: KeyboardEvent): boolean {
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
    pushPasteTarget({
      id,
      insert: (t: string) => {
        pane.shell = { ...pane.shell, input: pane.shell.input + t };
      },
    });
    return () => removePasteTarget(id);
  });

  let scrollerEl: HTMLDivElement | undefined = $state();

  // Auto-scroll to the bottom on new output — reads `lines.length` (a
  // $state read) and writes to the DOM node's own `scrollTop` (never back
  // into `pane.shell`), so this is not the read-then-write-same-$state
  // hazard PLAN.md's Risks section warns about.
  $effect(() => {
    const n = pane.shell.lines.length;
    void n;
    if (scrollerEl) scrollerEl.scrollTop = scrollerEl.scrollHeight;
  });

  const promptText = $derived(formatPrompt(mode, shell, pane.shell.cwd));
</script>

<div style="flex:1;min-height:0;display:flex;flex-direction:column;padding:10px 14px;font-size:13px;line-height:1.5;color:#c9d1d9">
  <div
    bind:this={scrollerEl}
    data-testid="shell-scroller"
    data-copy-source
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
