---
title: SafePass
order: 1
repos:
  - name: SafePass
    github: ShevinuM/SafePass
    branch: main
---
# SafePass

A local-first password manager: generate, store, and assess the strength of
every credential without handing a server your vault.

## Stack
- Java, PBKDF2 + HmacSHA256 password hashing with per-entry salt
- master-password-derived encryption for everything at rest
- optional server sync, local storage always the default

## Status
building · local vault + strength scoring in place
