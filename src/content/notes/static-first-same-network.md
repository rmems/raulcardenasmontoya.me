---
title: 'Static first, same network'
description: 'How the homepage draws the exact spiking network it will simulate before any script runs, and why the first live frame lands on that drawing.'
draft: false
published: 2026-10-25
---

The homepage hero is a live spiking neural network: Rust crates compiled to WebAssembly step 16 LIF neurons from pointer input, and Three.js draws the result. The hard part of a demo like this is what visitors see before it starts, and what they see when it cannot start. The site's answer is to make the first paint a drawing of the same network, produced at build time with no simulation.

## What the build draws

The browser bridge requires every live snapshot to carry one specific topology: the 16-neuron, 64-synapse graph that synaptic-wiring generates for the fixed seed, identified by its digest. The build takes that audited topology and lays it out with the same pure rules the renderer uses (`src/runtime/topology-layout.ts`): nodes on a ring with an index-keyed jitter, the camera framing expressed as an SVG `viewBox`, 10-pixel node markers, and edge colors mixed in linear color space from the polarity color toward the rule color by weight, exactly as `THREE.Color.lerp` does. A test checks every edge color against three.js and the geometry against the committed WASM package.

The result is plain inline SVG in the HTML. No WebAssembly runs at build time, and the drawing has no membrane state and no spikes. It is the network at rest.

## Nothing moves when WebGL takes over

The plate that holds the drawing has a fixed aspect ratio, so its size is known before any script runs. The WebGL surface is laid out over the same box at full size while hidden, so the renderer starts at its final size and is not cleared by a resize when it appears. The Play button and the input indicator are absolutely placed in a strip the plate reserves along its bottom edge. The two caption variants share one grid cell, and the status line reserves three lines of height.

The first live frame therefore lands on the drawing it replaces, at rotation 0. Headless Chrome measured a cumulative layout shift of 0 from navigation to live at 1440, 1024 and 768 pixels, with the headline as the largest contentful paint at every width.

## When nothing runs, the drawing is the product

Without JavaScript the hero is complete: copy, drawing, a `STATIC · diagram` label, and the crate trail that links each layer to its pinned source. With reduced motion the drawing stays until the reader presses Play, and the live view then carries pulses along the synapses with the camera held still. Without WebGL or WebAssembly, or when either fails, the runtime reports its reason in the status line, the label becomes `STATIC · diagram` or `UNAVAILABLE · Rust/WASM`, and the drawing stays. No JavaScript simulation substitutes for the Rust one.

*Update, 2026-10-28:* the hero now runs 48 neurons and 288 synapses behind a new contract (RM-2355), drawn on two concentric rings so every synapse has visible length. The numbers above describe the 16-neuron network the note was written about; the mechanism is unchanged.

*Update, 2026-10-28, later the same day:* the hero now runs 64 neurons and 512 synapses behind contract 8 (RM-2355), on the same two rings, and the reduced-motion path now runs pulses once Play is pressed while holding the camera still.

The label is the honest part. `LIVE · Rust/WASM` appears only after a verified adapter-backed runtime is actually running, and the same rule keeps recorded CUDA and FPGA results, which never run in the browser, on their own page.
