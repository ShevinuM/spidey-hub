// Unit tests for scripts/lib/freePort.ts — PLAN.md Phase 7.4's fix for
// scripts/capture-screenshots.mjs's hardcoded `PORT = 4323`, which used to
// collide silently with a running `astro dev` fallback port.
import { expect, test } from "vitest";
import { createServer, type AddressInfo } from "node:net";
import { pickPort } from "../../lib/freePort";

test("pickPort: returns the preferred port unchanged when it's free", async () => {
  // Ask the OS for a currently-unused port to use as "preferred" — avoids
  // hardcoding a port number that might genuinely be busy on the runner.
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", () => resolve()));
  const free = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));

  const result = await pickPort(free);
  expect(result.port).toBe(free);
  expect(result.usedPreferred).toBe(true);
});

test("pickPort: falls back to a different OS-assigned port when the preferred one is occupied", async () => {
  const occupied = createServer();
  await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", () => resolve()));
  const occupiedPort = (occupied.address() as AddressInfo).port;

  try {
    const result = await pickPort(occupiedPort);
    expect(result.port).not.toBe(occupiedPort);
    expect(result.usedPreferred).toBe(false);
    expect(result.port > 0 && result.port < 65536).toBeTruthy();
  } finally {
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
  }
});

test("pickPort: the fallback port is itself immediately bindable (not still reserved by the probe)", async () => {
  const occupied = createServer();
  await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", () => resolve()));
  const occupiedPort = (occupied.address() as AddressInfo).port;

  try {
    const { port } = await pickPort(occupiedPort);
    const real = createServer();
    await new Promise<void>((resolve, reject) => {
      real.once("error", reject);
      real.listen(port, "127.0.0.1", () => resolve());
    });
    await new Promise<void>((resolve) => real.close(() => resolve()));
  } finally {
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
  }
});
