---
title: 'One golden trace, three runtimes'
description: 'The same seed-9 replay has to produce bit-identical state in native Rust, in Node through wasm-bindgen, and in headless Chrome, or the build fails.'
draft: false
published: 2026-10-25
---

The browser demo is deterministic by contract: the same adapter and upstream revisions, contract version, configuration, ordered inputs, seed and step count must produce byte-equivalent exported state. No entropy, wall clock, locale, device capability or frame timing may affect a simulation result. A rule like that is only worth something if something checks it, so the repository carries a golden trace and replays it in three places.

## The fixture

`tests/fixtures/seed9-trace.json` is a list of operations for seed 9: `input` records with a sequence number and sample values, and `step` records with the expected state after that step. Expected values are stored as bits, not as decimals. Each membrane potential is the hexadecimal `f32` bit pattern, spike lists are neuron ids, and every 64-bit value such as the completed step or the last sequence is a decimal string, because a JavaScript number cannot hold a `u64`. A second fixture, `kinetic-seed9-trace.json`, does the same for contract 5, where each input is a recorded `[x, y, pressure]` pointer packet that passes through kinetic-signals feature extraction before encoding; its steps also pin the 16 feature values bit for bit.

Neither file is ever edited by hand. Each is written by an ignored Rust test (`regenerate_seed9_trace`, `regenerate_kinetic_seed9_trace`) that runs the native runtime and records what it produced. If upstream behaviour legitimately changes, the fixture is regenerated and the diff is reviewed. An intentional determinism break requires a contract-version change.

## Three replays

1. **Native Rust.** `tests/trace_fixture.rs` replays both fixtures against the runtime and compares every step, bit for bit. This runs in `cargo test --locked`.
2. **Node through wasm-bindgen.** `scripts/verify-neuromorphic-wasm.mjs` builds the crate for `wasm32-unknown-unknown`, runs the pinned `wasm-bindgen-cli` 0.2.126 into a temporary directory, loads the result in Node, replays the same fixture against it, and checks the exported snapshot's shape: typed arrays of the right kinds and lengths, a CSR topology whose offsets are monotonic, canonical edge order, and weights whose bit patterns match the parallel bit array.
3. **Headless Chrome.** `scripts/verify-neuromorphic-browser.mjs` serves the package to a real browser and replays the trace there, this time also asserting the exact topology digest, edge targets, delays and weight bits the live demo is allowed to display.

A fourth check sits beside them. The browser packages under `public/wasm/` are committed, and `npm run test:wasm-web-pkg` rebuilds them with the locked toolchain and compares the generated JavaScript glue and type declarations byte for byte. The `.wasm` binary itself is not byte-stable across build hosts, so for it the check requires only that it regenerates and is non-empty; the two replays above are what pin its behaviour. All of this runs in `npm run validate`, which CI runs on every pull request and again before every deploy.

## Why bits and not decimals

A decimal rendering of a float hides the question that matters: did the computation produce the same value, or one that merely prints the same? Comparing bit patterns across a native build, a WASM build and a browser makes the equivalence claim exact. It also keeps history honest: seeding the LIF weights changed the deterministic state relative to the previous contract, so the change shipped as contract 3 rather than as a silent update to contract 2.
