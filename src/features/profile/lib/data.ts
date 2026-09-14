// src/features/profile/content/*.md
import type { CollectionEntry } from "astro:content";
import type { ProfileData } from "../../../common/lib/data";

/** Splits a markdown body into paragraphs on blank lines — the profile
 * entry's body holds only plain-prose paragraphs (no lists/headings), so
 * this needs no markdown rendering. */
function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export const buildProfile = (entry: CollectionEntry<"profile">): ProfileData => {
  const { dossierHeading, ...rest } = entry.data;
  return {
    ...rest,
    dossier: { heading: dossierHeading, paragraphs: splitParagraphs(entry.body ?? "") },
  };
};
