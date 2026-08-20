// Command log rendering (emphasized words / real links inline) — moved
// verbatim out of Repositories.svelte during the folder+state-class relocation
// refactor (pure, rune-free helpers belong in src/lib).
import type { RepositoriesData } from "./data";

export interface LogToken {
  text: string;
  kind: "plain" | "emphasis" | "link";
  href?: string;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function tokenizeLogLine(line: RepositoriesData["commandLog"][number]): LogToken[] {
  const specials: { match: string; kind: "emphasis" | "link"; href?: string }[] = [
    ...(line.emphasize ?? []).map((m) => ({ match: m, kind: "emphasis" as const })),
    ...(line.links ?? []).map((l) => ({ match: l.text, kind: "link" as const, href: l.href })),
  ];
  if (specials.length === 0) return [{ text: line.text, kind: "plain" }];
  const pattern = new RegExp(`\\b(${specials.map((s) => escapeRegExp(s.match)).join("|")})\\b`, "g");
  return line.text
    .split(pattern)
    .filter((s) => s.length > 0)
    .map((s) => {
      const special = specials.find((sp) => sp.match === s);
      return special ? { text: s, kind: special.kind, href: special.href } : { text: s, kind: "plain" as const };
    });
}
