---
title: daily-tech-digest
order: 0
repos:
  - name: daily-tech-digest
    github: ShevinuM/daily-tech-digest
    branch: main
---
# daily-tech-digest

A personal reading digest: fetched, ranked, and summarized on a schedule by
GitHub Actions, published to a small static "Reading Hub" site — no server
to run, no SaaS bill.

## Stack
- Python pipeline: fetch → filter → rank → extractive summary
- one batched LLM call to pick, group, and write prose over pre-scored items
- Astro site on GitHub Pages, updated by the same workflow

## Status
in progress · backend + frontend rewrite underway
