---
title: 'An adapter, not another simulator'
description: 'Why the Rust crate behind the browser demo composes published crates instead of reimplementing their algorithms, and what that rule costs and buys.'
draft: false
published: 2026-10-25
---

The crate that powers the homepage demo, `neuromorphic-adapter`, is deliberately small. It owns the browser boundary: JavaScript interop through wasm-bindgen, typed-array transfer, lifecycle messages, error translation, and the composition of upstream crates. It does not own an algorithm. Feature extraction belongs to kinetic-signals, sensory-to-spike encoding to axon-encoder, neuron dynamics and spike generation to neuromod, topology, routing and delays to synaptic-wiring, reward and modulator mapping to limbic-critic, training orchestration to plasticity-lab, NIR interchange to nir-rs, and the protocol envelope with its validation to corpus-ipc.

## The rule

Dependencies point from the adapter to those crates, never back. The crates stay browser-agnostic: Three.js, DOM types, workers and wasm-bindgen do not appear in their APIs. And a failing dependency is an upstream compatibility blocker, not permission to add a site-local substitute. When plasticity-lab's published release still required an older neuromod than the adapter uses, the fix was to pin the git revision that targets the current neuromod and record it in the lockfile, not to copy the training loop into the site.

## What it costs

The adapter cannot smooth anything over. Every pin is exact: registry crates with `=` versions, git crates with a full revision, and a `Cargo.lock` that is part of the contract. The homepage's crate trail lists those pins, and a test fails when they drift from `Cargo.toml` or `Cargo.lock`.

It also means auditing. Before a crate enters the browser graph, it is checked on `wasm32-unknown-unknown` at an exact commit with only its selected features, and the result is recorded with the command that produced it. The browser build excludes corpus-ipc's ZeroMQ and server features, nir-rs's HDF5 reader and every CUDA path, and `scripts/verify-browser-dependencies.mjs` enforces that policy on the resolved dependency graph in CI. The lab features (`nir`, `protocol`, `plasticity`) compile only into a second package, so the homepage never downloads nir-rs or the plasticity crates.

## What it buys

Provenance that holds up. Every pulse in the hero can be traced to a crate, a version and a commit, and the telemetry panel labels each value with the layer it came from. The demo is evidence that the published crates compose in a real pipeline, which is a stronger claim than a demo written for the demo. And when something is wrong, it is wrong in one place: either the adapter mis-wired a boundary, or an upstream crate needs a fix that every other consumer of that crate also gets.
