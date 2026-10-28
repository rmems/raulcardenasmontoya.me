# Performance budgets for the live neuromorphic demo

- **Scope:** GitHub #10 / Linear RM-1646. Builds on #6 (renderer), #7 (spike
  propagation), #8 (`kinetic-signals` input), #14 (`neuromod`), and #15
  (`axon-encoder`).
- **Recorded:** 2026-10-09, on one machine (see [Measurement
  context](#measurement-context)).
- **Related:** [`browser-runtime.md`](browser-runtime.md) (contracts and
  lifecycle). The harnesses are in `scripts/perf/` and
  `crates/neuromorphic-adapter/examples/stage_bench.rs`.

This document keeps two kinds of numbers apart:

- **Targets** are design decisions. They say what the demo must stay within,
  and they hold whether or not anything has been measured.
- **Measurements** come from runs that were actually performed, with the
  machine, OS, browser, GPU renderer string, and headless or headed mode
  recorded next to them. A number with no recorded run is listed under
  [Not measured](#not-measured) instead.

## Summary

- On the reference desktop, the shipped pipeline (16 neurons, 64 synapses,
  contract 5) runs far inside every target. One full WASM step (`input` plus
  `step`) takes 1.95 to 4.4 µs in Chrome. Drawing a frame takes 0.08 to 0.12 ms
  on the main thread. No tick overran its 50 ms slot in any measured window.
- The biggest per-step cost was the TypeScript bridge, not Rust. It read
  wasm-bindgen getters dozens of times per snapshot (each read copies the array
  out of WASM again), rebuilt a string multiset to check the routed topology on
  every step, and never freed the WASM state handle. In Chrome that took 39.7 to
  41.1 µs per snapshot, and it grew without bound in tight loops: in Node it
  reached 435 µs while WASM linear memory reached 477 MB. Reading each getter
  once, freeing the handle, and caching the routed-topology check by value
  brought it to 11.9 to 12.9 µs, with flat WASM memory. Outputs are unchanged,
  and the goldens and the new equivalence test still pass.
- At synthetic scale, simulation is the first bottleneck. The `neuromod` LIF
  bank grows as neurons × channels: one step at 1024 neurons takes 7.6 ms
  native and 12.4 to 13.2 ms as WASM. Rendering 1024 nodes, 32,768 edges, and
  about 15,500 pulses takes 1.07 to 1.09 ms per frame and leaves Chrome's frame
  cadence unchanged. These sizes are not what ships.
- Adaptive quality now caps the pixel ratio, pulse count, frame rate, and
  telemetry refresh. It steps down under sustained frame-time pressure, with
  hysteresis. With a 20× CPU throttle on the largest synthetic topology, it
  stepped from full to balanced at 2.4 s. It tried full again at 9.4 s, fell
  back at 11.5 s, and the flap guard then doubled the next recovery wait. The
  exact path varied between runs (section 6).
- The homepage hero (#13) moves the island to the top of the page without
  adding per-frame work, and the live page measured the same as before
  ([section 10](#10-homepage-hero-13)). Its first screen shifts nothing when
  WebGL takes over (cumulative layout shift 0), and the headline stays the
  largest contentful paint.
- Offscreen and hidden pages do no simulation or render work: 0 ticks and 0
  frames over 3 s, in both headless and headed Chrome, measured live.
- RM-2355 (contract 7) moved the shipped topology from 16 neurons / 64
  synapses to 48 / 288. Measured on a different, slower machine
  ([section 12](#12-contract-7-48-neurons-rm-2355)): one native `input` +
  `step` takes 30 to 34 µs median (the 16-neuron bank takes 5.5 µs on the same
  machine), every live window in headless Chrome held its 50 ms cadence with
  no overrun and no eviction, and frame work at the full level stayed inside
  R2 at every quality level. Sections 1 to 11 keep their reference-desktop
  numbers for the 16 / 64 topology.

## Targets

These are design decisions. The measurement column points to the evidence
below. "Low-end" targets have no measurement yet; see [Not
measured](#not-measured).

### Simulation (fixed 50 ms logical tick)

| # | Budget | Target | Reference-desktop measurement |
| --- | --- | --- | --- |
| S1 | Simulation cadence | Fixed 20 Hz (`DEMO_TICK_MS` = 50 ms), never adapted | Fixed. The equivalence test pins it |
| S2 | WASM work per step (`input` + `step`, including the Rust snapshot clone) | ≤ 0.25 ms p95 desktop; ≤ 1 ms p95 low-end | 1.95–4.4 µs median (Chrome); p95 1.2–3.2 µs native, 1.9–5.1 µs WASI |
| S3 | WASM → JS snapshot transfer (getters, bridge validation, JS-owned copies) | ≤ 0.05 ms per step | 11.9–12.9 µs `bridge state()` (Chrome) |
| S4 | Worker tick round trip (input + step messages, transfer) | ≤ 1 ms p95 | 66.5–72.2 µs median (microbench); live `tick` p95 0.4–0.6 ms |
| S5 | Tick overruns (a tick still running when the next is due) | 0 per minute | 0 in every live window (no `tick-overrun` count) |
| S6 | Main-thread work per published step (renderer latch, spike ingestion, listeners, telemetry hook) | ≤ 0.25 ms p95 | `publish` p95 ≤ 0.1 ms (timer floor) |
| S7 | Spike-event throughput | ≤ 288 events per step (every neuron × 6 synapses, contract 7) = 5,760 per second, within the 8,192-event ring (worst case 288 × (4 + 18 + 1) = 6,624 buffered with the 18-step retention the 1/4-speed display clock needs; the ring is that worst case rounded up to a power of two, derived in `spike-events.ts`). On the 16 / 64 contracts the bound was 64 per step within 2,048 | 16 / 64: ≤ 63.97 events per step; 0 evictions in every run; the pointer-active window ended with 1,289 buffered of 2,048 ([section 4](#4-live-page-in-chrome-real-worker-real-renderer)). 48 / 288: see [section 12](#12-contract-7-48-neurons-rm-2355) |
| S8 | Memory | WASM linear memory flat per step; every JS buffer fixed-size (see [audit](#buffer-audit)) | Flat (5000 steps: +0 bytes with the fix) |
| S9 | Topology size | 48 / 288 ships (contract 7, RM-2355); contracts 3 to 6 keep 16 / 64. A new contract that grows it further must keep S2 within budget on low-end devices: ≤ 256 neurons, and must re-check the full level's pulse count against R2 and the ring against S7 | 256 neurons: 0.48 ms native, 0.80–0.90 ms WASI per SNN step (reference desktop). 48 neurons: 30–34 µs native `input` + `step` on the slower RM-2355 machine ([section 12](#12-contract-7-48-neurons-rm-2355)) |

### Rendering

| # | Budget | Target | Reference-desktop measurement |
| --- | --- | --- | --- |
| R1 | Frame pacing at full quality | p95 frame interval ≤ 18.2 ms (55 fps) | 6.1–6.2 ms p95 |
| R2 | Main-thread draw time per frame, shipped topology, full quality | ≤ 2 ms p95 desktop; ≤ 8 ms mean low-end (the adaptive budget) | 0.2 ms p95 (0.1 ms timer); 0.08–0.12 ms mean. With the 1/4-speed display clock (#104): 0.2–0.3 ms p95, 0.10–0.20 ms mean, with up to 908 pulses per frame ([section 4](#4-live-page-in-chrome-real-worker-real-renderer), [section 5](#5-render-stress-synthetic-topologies-through-the-shipped-renderer)) |
| R3 | Degradation trigger | Step down after 2 consecutive 1 s windows with p90 interval > 22.2 ms (below 45 fps) or mean draw > 8 ms. Step up after 5 consecutive windows with p90 < 18.2 ms and draw < 4 ms; flapping doubles the wait, up to 40 | Exercised under a 20× CPU throttle (below) |
| R4 | Pixel-ratio cap per level | 2 / 1.5 / 1 / 1 | Applied: DPR 3 display rendered at 2 / 1.5 / 1 / 1 |
| R5 | Pulses drawn per frame per level | all buffered / 256 / 96 / 0 | 15,515 / 256 / 96 / 0 (1024-node stress, headed); 16,384 (the stress ring, saturated) / 256 / 96 / 0 after #104 |
| R6 | Frame-rate cap per level | none / none / 30 fps / 20 fps | ~17% and ~11% of animation frames drawn at reduced / minimal |
| R7 | Telemetry/DOM refresh ceiling per level | every step (20 Hz) / 10 / 2 / 1 Hz. It only lowers the live telemetry panel's own 4 Hz (1 Hz under reduced motion), so the panel refreshes at 4 / 4 / 2 / 1 Hz | Panel followed 4 → 2 → 1 → 2 → 4 Hz as quality stepped down under throttle and back up ([section 9](#9-telemetry-panel-under-quality-pressure)) |
| R8 | Offscreen or hidden | 0 simulation ticks and 0 frames | 0 / 0 |
| R9 | Live-demo payload (island entry plus lazily loaded three.js, WASM, glue, worker) | ≤ 250 KB brotli | 235,253 bytes brotli with the telemetry panel closed; 241,781 once it is opened (homepage hero, [section 10](#10-homepage-hero-13)) |
| R10 | First live frame after the island becomes eligible | ≤ 500 ms on desktop | 120.3 ms headless after navigation start, from localhost, with the island in the hero ([section 10](#10-homepage-hero-13)); 378.7 ms headed before the rebase onto #48, not re-measured |

## Measurement context

Every measurement below comes from this machine and these runs unless a row
says otherwise.

| Item | Value |
| --- | --- |
| Machine | Desktop, ASUS motherboard, AMD Ryzen 9 9950X (16 cores, 32 threads), 64 GB RAM |
| GPU / display | NVIDIA GeForce RTX 5080 (driver 32.0.16.1714) driving a 3840×2160 display that Windows reports at 239 Hz; integrated AMD Radeon also present |
| OS | Windows 11 Home 10.0.26200, "Balanced" power plan |
| Browser | Chrome 155.0.8059.40 (V8 15.5.35.20), fresh profile per run |
| WebGL renderer (`WEBGL_debug_renderer_info`) | `ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 (0x00002C02) Direct3D11 vs_5_0 ps_5_0, D3D11)` in **both** headless and headed runs. Hardware rendering, not SwiftShader |
| Headless run | `--headless=new`, DPR 1, viewport 1244×795, 2026-10-09 09:06 UTC |
| Headed run | Visible window, DPR 3 (Windows display scaling 300%), viewport 1268×641, 2026-10-09 09:09 UTC |
| Throttled run | Headless as above with `Emulation.setCPUThrottlingRate` 20 on the page |
| Chrome flags (both) | `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling`. Visibility is driven explicitly instead (see [Offscreen](#offscreen-and-background)) |
| `performance.now()` resolution | 0.1 ms (page is not cross-origin isolated). Live-page samples below 0.1 ms are quantized; their means are approximate. Exact per-stage costs come from the batched microbenchmarks |
| Node (boundary and WASI runs) | Node 22.12.0, V8 12.4.254.21 |
| Rust | 1.98.1, `--release` (opt-level 3) for the native and `wasm32-wasip1` harness builds. The Node and Chrome boundary runs use the committed `public/wasm/neuromorphic-adapter` package |
| Site build | `npm run build` (production), served by the harness's static server on `127.0.0.1` with `cache-control: no-store` and no compression |
| Revision | Sections 3 to 7: this branch on top of the #45 head `f944b2a`. After rebasing onto #48 (`29d35ab`, which brings #46 and #47 with it) and the review fixes (capped levels draw the newest pulses; draws the clock times at 0 ms count toward the mean), sections 8 and 9 and a short render-stress check (section 5) were re-measured on the final tree. #46 to #48 change neither the default WASM package, the bridge, the renderer, nor the worker path, and the telemetry panel is closed by default, so sections 3 to 7 describe a closed panel. Sections 1 and 2 ran on the same Rust crate sources, which those bases do not change |

Chrome delivered animation frames about every 5.5 to 5.9 ms (about 170 to 180
Hz) in both modes, even though the display reports 239 Hz. Frame-interval
numbers are therefore Chrome's frame cadence on this machine. They are not a
GPU limit.

## Measurements

### 1. Rust pipeline, per stage

`stage_bench` records each stage's real inputs from one pipeline run, then
times each stage separately with a fresh instance. Cells are the median of 15
runs × 2000 ticks, in µs per tick. The "input+step" columns go through the
real `BrowserRuntime`; its p95, p99, and max are per-tick samples at the
100 ns resolution of Windows `QueryPerformanceCounter`. "Materialize" is the
`state()` clone the contract makes every step.

**Native x86_64 (Windows):**

| input | mode | encoded spikes/tick | LIF spikes/tick | extract | encode | propagate | SNN step | materialize | input+step | p95 | p99 | max |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| scripted | delta | 2.88 | 1.58 | 0.023 | 0.061 | 0.069 | 1.380 | 0.497 | 2.130 | 2.500 | 2.700 | 3.900 |
| scripted | temporal | 0.05 | 0.78 | 0.024 | 0.068 | 0.036 | 1.224 | 0.504 | 1.894 | 2.200 | 2.300 | 19.100 |
| scripted | rate | 3.82 | 1.70 | 0.024 | 0.154 | 0.078 | 1.454 | 0.497 | 2.263 | 2.600 | 2.900 | 42.800 |
| pointer-active | delta | 6.83 | 1.70 | 0.026 | 0.092 | 0.102 | 1.376 | 0.491 | 2.225 | 2.600 | 2.700 | 22.300 |
| pointer-active | temporal | 4.39 | 1.29 | 0.026 | 0.139 | 0.080 | 1.325 | 0.519 | 2.167 | 2.500 | 2.700 | 4.200 |
| pointer-active | rate | 8.98 | 2.43 | 0.026 | 0.226 | 0.127 | 1.570 | 0.524 | 2.545 | 2.900 | 3.100 | 20.900 |
| pointer-idle | delta | 0.00 | 0.79 | 0.021 | 0.011 | 0.034 | 1.232 | 0.500 | 1.815 | 2.100 | 2.200 | 3.200 |
| pointer-idle | temporal | 0.00 | 0.78 | 0.021 | 0.066 | 0.036 | 1.214 | 0.500 | 1.868 | 2.100 | 2.300 | 5.100 |
| pointer-idle | rate | 2.00 | 1.11 | 0.021 | 0.083 | 0.054 | 1.251 | 0.498 | 1.950 | 2.200 | 2.500 | 46.400 |

**Same harness compiled to `wasm32-wasip1`, run by Node 24.20.0 (V8 13.6):**

| input | mode | encoded spikes/tick | LIF spikes/tick | extract | encode | propagate | SNN step | materialize | input+step | p95 | p99 | max |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| scripted | delta | 2.88 | 1.58 | 0.041 | 0.053 | 0.075 | 2.180 | 0.285 | 3.124 | 3.400 | 3.700 | 119.300 |
| scripted | temporal | 0.05 | 0.78 | 0.032 | 0.091 | 0.033 | 1.987 | 0.210 | 2.633 | 3.000 | 3.300 | 82.400 |
| scripted | rate | 3.82 | 1.70 | 0.031 | 0.134 | 0.084 | 2.271 | 0.200 | 3.159 | 3.500 | 4.700 | 161.300 |
| pointer-active | delta | 6.83 | 1.70 | 0.033 | 0.052 | 0.111 | 2.214 | 0.200 | 3.207 | 3.400 | 5.000 | 194.500 |
| pointer-active | temporal | 4.39 | 1.29 | 0.033 | 0.128 | 0.083 | 2.202 | 0.198 | 2.905 | 3.300 | 3.700 | 132.000 |
| pointer-active | rate | 8.98 | 2.43 | 0.033 | 0.161 | 0.138 | 2.404 | 0.209 | 3.310 | 3.800 | 4.100 | 27.600 |
| pointer-idle | delta | 0.00 | 0.79 | 0.027 | 0.019 | 0.030 | 1.968 | 0.201 | 2.545 | 2.900 | 3.500 | 134.200 |
| pointer-idle | temporal | 0.00 | 0.78 | 0.027 | 0.089 | 0.030 | 1.895 | 0.203 | 2.522 | 2.900 | 3.100 | 4.800 |
| pointer-idle | rate | 2.00 | 1.11 | 0.026 | 0.059 | 0.056 | 1.876 | 0.199 | 2.520 | 2.900 | 3.100 | 9.000 |

The input sources are the shipped scripted Lissajous path, a deterministic
fast jittered drag with pressure ("pointer-active"), and a pointer held still
("pointer-idle"). The `neuromod` step is the largest stage in every workload.
Natively it takes 1.21 to 1.57 µs per tick, and the shipped LIF bank now fires 0.78 to 2.43
of its 16 neurons per tick on average (sparse, desynchronised firing, RM-2352).
Extraction, encoding, and propagation are each under 0.25 µs.

**Re-measured for RM-2352.** Before sparse firing, `scripted/delta` and
`scripted/rate` produced 15.99 and 15.98 LIF spikes per tick, which is every
neuron every tick, and `pointer-active/temporal` produced 15.95. The two
tables above, and the LIF-spikes and events columns of the Chrome table in
section 3, were regenerated after that change: `npm run perf:stages` for the
native table, `node scripts/perf/run-wasi-stage-bench.mjs` for the WASI table
and `node scripts/perf/measure-node.mjs` for the Chrome table's two
simulation columns. Those columns are deterministic, so a Node run of the
shipped package gives the values Chrome sees; the Chrome timing columns are
unchanged from the October 9 run. The stage benchmark now steps the same
`LifBankShaping` the runtime uses (`crates/neuromorphic-adapter/src/lif_bank.rs`),
so these rows measure the shipped bank. The synthetic topologies below keep the
old uniform-weight bank because they are not what ships. The rows were
re-run on Node 24.20.0 (V8 13.6) and Rust 1.99.0, not the Node 22.12.0 and Rust
1.98.1 listed in the context table.

### 2. Synthetic topologies (not shipped)

These are larger `synaptic-wiring` small-world graphs and `neuromod` LIF banks,
built through the same crates. Source spikes come from a deterministic hash at
10% or 50% of neurons per tick. When this was measured the shipped adapter was
fixed at 16 / 64; since RM-2355 it ships 48 / 288 (contract 7), and the
harness's scale list gained that row ([section 12](#12-contract-7-48-neurons-rm-2355)
has it, on a different machine). Cells are in µs per tick: the median of 7
runs × 400 ticks, or × 100 ticks for ≥ 1024 neurons. "Snapshot bytes" is what
the contract-5 state would carry per step at that size.

| neurons | fan-out | synapses | firing | events/tick | snapshot bytes | propagate (native) | SNN step (native) | materialize (native) | propagate (WASI) | SNN step (WASI) | materialize (WASI) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 16 | 4 | 64 | 10% | 6.4 | 2,192 | 0.054 | 2.080 | 0.283 | 0.061 | 3.569 | 0.259 |
| 16 | 4 | 64 | 50% | 32.1 | 2,216 | 0.112 | 2.099 | 0.274 | 0.130 | 3.667 | 0.230 |
| 64 | 8 | 512 | 10% | 51.3 | 15,968 | 0.165 | 30.269 | 0.393 | 0.214 | 55.782 | 0.330 |
| 64 | 8 | 512 | 50% | 256.3 | 16,072 | 0.632 | 30.115 | 0.391 | 0.771 | 52.771 | 0.334 |
| 256 | 16 | 4,096 | 10% | 409.7 | 123,056 | 1.071 | 478.121 | 1.426 | 1.249 | 897.851 | 1.244 |
| 256 | 16 | 4,096 | 50% | 2,048.5 | 123,464 | 4.788 | 478.445 | 1.420 | 5.567 | 804.160 | 1.295 |
| 1024 | 32 | 32,768 | 10% | 3,277.4 | 967,136 | 8.532 | 7,584.274 | 171.827 | 9.588 | 13,211.792 | 12.395 |
| 1024 | 32 | 32,768 | 50% | 16,384.0 | 968,776 | 37.802 | 7,607.166 | 48.995 | 43.399 | 12,440.503 | 12.456 |
| 2048 | 32 | 65,536 | 10% | 6,554.9 | 1,934,204 | 15.737 | 30,608.795 | 37.725 | 18.618 | 53,386.000 | 26.349 |
| 2048 | 32 | 65,536 | 50% | 32,769.9 | 1,937,480 | 75.919 | 30,833.705 | 34.369 | 87.901 | 50,822.204 | 26.640 |

The SNN step grows 14.5 to 16× each time the neuron count quadruples; it is
O(neurons × channels). At 2048 neurons the WASM SNN step alone (50.8 to
53.4 ms) is longer than the 50 ms tick, so S5 would fail. Native
materialization of ~1 MB snapshots varied between the two 1024-neuron rows
(49.0 vs 171.8 µs); the cause was not investigated. Propagation stays linear
in events.

### 3. WASM ↔ JS transfer for the contract-5 snapshot

`scripts/perf/boundary-bench.mjs` runs against the committed `web` package
and the shipped bridge. Cells are the median of 7 runs × 2000 ticks, in µs per
tick. A contract-5 snapshot carries 2,184 to 2,248 bytes of typed arrays, of
which 2,056 bytes (91%) is the static topology projection, re-sent every step.
Contract 6 (#95, `browser-runtime.md`) sends that projection once at init and
leaves the twelve topology arrays empty in every snapshot, so a per-step
snapshot carries 128 to 192 bytes of typed arrays (measured over 400 steps
against the committed package: potentials, spikes and features) and the
projection crosses once as 2,056 bytes plus the digest; the worker transfers
three buffers per step instead of fifteen; the live demo uses it. The bench
below measured contract 5; its `contract` option now defaults to the live
contract.

| stage | what it times |
| --- | --- |
| raw input | `WasmAdapter.input` only: packet copy-in, `kinetic-signals`, `axon-encoder` |
| raw input+step | adds `synaptic-wiring`, `neuromod`, and the Rust `state()` clone; the handle is freed at once |
| raw state() | Rust clone plus wrapper allocation |
| getters | every field read once out of WASM into JS-owned arrays |
| bridge state() | the shipped bridge: Rust clone, getters, validation, JS-owned copies |
| bridge tick | the full main-thread fallback path, `input` + `step` |
| worker tick | the shipped worker module: input and step messages, with snapshot buffers transferred back |
| spike ingest | `SpikeEventBuffer.ingest` of those real snapshots |

**Chrome 155 (bridge before and after this change, headless and headed):**

| run | bridge | input | mode | raw input | raw input+step | raw state() | getters | bridge state() | bridge tick | worker tick | spike ingest | LIF spikes/tick | events/tick |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| headless | before | scripted | delta | 0.3 | 4.35 | 0.35 | 3.75 | 41.05 | 50.8 | 68.35 | 3.15 | 1.58 | 6.34 |
| headless | before | scripted | temporal | 0.25 | 2 | 0.35 | 4 | 40.7 | 45.7 | 73.15 | 0.5 | 0.78 | 3.11 |
| headless | before | scripted | rate | 0.3 | 4.3 | 0.4 | 4.45 | 39.7 | 47.5 | 69.05 | 3 | 1.70 | 6.81 |
| headless | before | pointer-active | delta | 0.25 | 4.2 | 0.35 | 4.2 | 39.85 | 48.35 | 73.2 | 3.1 | 1.70 | 6.80 |
| headless | before | pointer-active | temporal | 0.3 | 4.4 | 0.35 | 4.7 | 40.9 | 50.6 | 93.6 | 3.4 | 1.29 | 5.15 |
| headless | before | pointer-active | rate | 0.35 | 4.4 | 0.35 | 4.45 | 40.25 | 48.05 | 69.15 | 3.15 | 2.43 | 9.71 |
| headless | after | scripted | delta | 0.35 | 4.2 | 0.35 | 3.65 | 12.05 | 17.95 | 70.25 | 3.8 | 1.58 | 6.34 |
| headless | after | scripted | temporal | 0.25 | 1.95 | 0.35 | 3.95 | 12.1 | 13.95 | 67.95 | 0.55 | 0.78 | 3.11 |
| headless | after | scripted | rate | 0.35 | 4.35 | 0.35 | 4.15 | 12.3 | 16.55 | 71.25 | 3.1 | 1.70 | 6.81 |
| headless | after | pointer-active | delta | 0.25 | 4.2 | 0.35 | 3.9 | 12.05 | 16.3 | 69.2 | 3.2 | 1.70 | 6.80 |
| headless | after | pointer-active | temporal | 0.3 | 4.3 | 0.35 | 4.15 | 12.35 | 16.55 | 69.35 | 3 | 1.29 | 5.15 |
| headless | after | pointer-active | rate | 0.35 | 4.35 | 0.35 | 3.85 | 12 | 16.35 | 68.7 | 3.15 | 2.43 | 9.71 |
| headed | after | scripted | delta | 0.3 | 4.25 | 0.35 | 3.6 | 12.35 | 16.85 | 70.45 | 3.15 | 1.58 | 6.34 |
| headed | after | scripted | temporal | 0.25 | 1.95 | 0.35 | 3.95 | 12.7 | 14.15 | 66.5 | 0.5 | 0.78 | 3.11 |
| headed | after | scripted | rate | 0.35 | 4.3 | 0.4 | 4 | 12.7 | 16.95 | 68.25 | 2.95 | 1.70 | 6.81 |
| headed | after | pointer-active | delta | 0.25 | 4.15 | 0.35 | 3.95 | 11.9 | 16.65 | 72.2 | 3.1 | 1.70 | 6.80 |
| headed | after | pointer-active | temporal | 0.3 | 4.35 | 0.35 | 4.3 | 12.9 | 17.6 | 69.05 | 2.95 | 1.29 | 5.15 |
| headed | after | pointer-active | rate | 0.35 | 4.4 | 0.35 | 4.1 | 12.1 | 16.3 | 69.45 | 3.1 | 2.43 | 9.71 |

**Node 22.12.0 (same benchmark, no worker):**

| bridge | input | mode | raw input | raw input+step | raw state() | getters | bridge state() (min–max of 7) | bridge tick | spike ingest |
|---|---|---|---:|---:|---:|---:|---|---:|---:|
| before | scripted | delta | 0.365 | 5.71 | 0.566 | 3.678 | 47.171 (45.051–50.787) | 69.347 | 4.428 |
| before | scripted | temporal | 0.307 | 2.401 | 0.506 | 3.113 | 192.703 (186.418–199.622) | 268.897 | 0.897 |
| before | scripted | rate | 0.381 | 5.753 | 0.498 | 2.946 | 240.7 (231.174–253.871) | 304.77 | 4.274 |
| before | pointer-active | delta | 0.317 | 5.606 | 0.484 | 2.717 | 297.3 (276.16–320.772) | 370.11 | 4.32 |
| before | pointer-active | temporal | 0.369 | 5.649 | 0.499 | 2.78 | 371.836 (356.802–389.413) | 436.928 | 4.246 |
| before | pointer-active | rate | 0.409 | 5.718 | 0.508 | 2.722 | 434.788 (420.828–459.222) | 508.293 | 4.315 |
| after | scripted | delta | 0.365 | 5.76 | 0.51 | 3.42 | 11.365 (10.945–13.429) | 17.645 | 4.796 |
| after | scripted | temporal | 0.321 | 2.536 | 0.499 | 3.284 | 10.638 (10.292–12.552) | 13.801 | 0.717 |
| after | scripted | rate | 0.345 | 5.628 | 0.472 | 2.853 | 10.517 (10.472–10.657) | 17.829 | 4.258 |
| after | pointer-active | delta | 0.264 | 5.629 | 0.484 | 2.774 | 10.585 (10.414–10.897) | 17.471 | 4.221 |
| after | pointer-active | temporal | 0.336 | 5.525 | 0.484 | 2.864 | 10.325 (10.223–10.388) | 17.05 | 4.249 |
| after | pointer-active | rate | 0.417 | 5.679 | 0.468 | 2.809 | 10.415 (10.254–10.829) | 17.777 | 4.278 |

**WASM linear memory.** The benchmark runs 5000 synchronous steps with and
without freeing each step's state handle:

| run | before the steps | without `free()` | with `free()` |
| --- | ---: | ---: | ---: |
| Node, bridge after | 1,245,184 B | 14,876,672 B (+13.6 MB, ≈2.7 KB/step) | +0 B |
| Chrome headless, bridge after | 1,179,648 B | 14,811,136 B (+13.6 MB) | +0 B |
| Node, bridge before | 477,626,368 B (already grown by the earlier rows) | 491,257,856 B | +0 B |
| Chrome headless, bridge before | 80,936,960 B (already grown) | no further growth | +0 B |

The old bridge relied on wasm-bindgen's `FinalizationRegistry` to free each
`WasmState`. Finalizers are scheduled as tasks, so in tight loops they never
ran: linear memory grew, and in Node the per-snapshot cost rose with it
across the run (47.2 → 434.8 µs in the "before" rows). The bridge now
reads each getter exactly once and frees the handle immediately. It also checks
the routed topology against its canonical projection by value against the
last verified copy, instead of rebuilding a string multiset every step; any
difference still triggers the full check. In a one-off Node profile of the
read-once bridge (not committed), that rebuild took 23.0 of 31.3 µs per
snapshot.

### 4. Live page in Chrome (real worker, real renderer)

This is `/?neuromorphic-perf` on the production build. Each window lasts 8 s
after a 0.4 s settle. Levels 0 to 3 are pinned through `forceQuality`;
"adaptive" is left unpinned. Pointer runs drive CDP mouse events across the
render surface at about 32 events per second, pressed 3 s out of every 4 s;
every input-source sample during those windows reported `pointer`. Times are
mean / p95 / max in ms, quantized at 0.1 ms.

| run | scenario | level | DPR applied | ticks | tick | tick-step | publish | spike ingest | frames drawn / skipped | frame work | frame interval | pulses per drawn frame |
|---|---|---|---:|---:|---|---|---|---|---|---|---|---:|
| headless | scripted, adaptive | full | 1 | 161 | 0.35 / 0.50 / 0.70 | 0.20 / 0.30 / 0.40 | 0.01 / 0.10 / 0.20 | 0.01 / 0.10 / 0.10 | 1459 / 0 | 0.08 / 0.20 / 0.40 | 5.54 / 6.10 / 6.90 | 14.5 |
| headless | scripted | full | 1 | 162 | 0.35 / 0.50 / 0.70 | 0.19 / 0.30 / 0.40 | 0.02 / 0.10 / 0.20 | 0.01 / 0.10 / 0.10 | 1447 / 0 | 0.08 / 0.20 / 0.20 | 5.58 / 6.10 / 7.10 | 10.7 |
| headless | scripted | balanced | 1 | 162 | 0.37 / 0.50 / 1.10 | 0.20 / 0.30 / 0.90 | 0.01 / 0.10 / 0.10 | 0.00 / 0.00 / 0.10 | 1439 / 0 | 0.10 / 0.20 / 0.40 | 5.61 / 6.20 / 6.80 | 17.6 |
| headless | scripted | reduced | 1 | 161 | 0.25 / 0.40 / 0.60 | 0.13 / 0.20 / 0.30 | 0.01 / 0.10 / 0.10 | 0.01 / 0.10 / 0.10 | 230 / 1152 | 0.09 / 0.20 / 0.30 | 5.83 / 6.10 / 6.90 | 8.6 |
| headless | scripted | minimal | 1 | 161 | 0.26 / 0.40 / 0.90 | 0.14 / 0.30 / 0.60 | 0.01 / 0.10 / 0.10 | 0.01 / 0.10 / 0.10 | 155 / 1229 | 0.10 / 0.20 / 0.40 | 5.83 / 6.10 / 6.70 | 0.0 |
| headless | pointer-active | full | 1 | 162 | 0.39 / 0.60 / 0.90 | 0.20 / 0.30 / 0.60 | 0.03 / 0.10 / 0.10 | 0.02 / 0.10 / 0.10 | 1418 / 0 | 0.12 / 0.20 / 0.30 | 5.69 / 6.20 / 6.70 | 173.6 |
| headless | pointer-active | minimal | 1 | 161 | 0.30 / 0.40 / 1.70 | 0.15 / 0.30 / 0.30 | 0.02 / 0.10 / 0.10 | 0.01 / 0.10 / 0.10 | 157 / 1248 | 0.12 / 0.20 / 0.30 | 5.73 / 6.10 / 7.10 | 0.0 |
| headed | scripted, adaptive | full | 2 | 162 | 0.34 / 0.50 / 0.80 | 0.19 / 0.30 / 0.50 | 0.01 / 0.10 / 0.10 | 0.01 / 0.10 / 0.10 | 1447 / 0 | 0.09 / 0.20 / 0.40 | 5.57 / 6.10 / 7.90 | 15.0 |
| headed | scripted | full | 2 | 161 | 0.31 / 0.50 / 0.70 | 0.18 / 0.30 / 0.40 | 0.01 / 0.10 / 0.10 | 0.01 / 0.10 / 0.10 | 1452 / 0 | 0.08 / 0.20 / 0.20 | 5.56 / 6.10 / 6.70 | 10.7 |
| headed | scripted | balanced | 1.5 | 162 | 0.29 / 0.50 / 0.70 | 0.17 / 0.30 / 0.50 | 0.01 / 0.10 / 0.20 | 0.01 / 0.10 / 0.10 | 1438 / 0 | 0.09 / 0.20 / 0.30 | 5.62 / 6.10 / 6.70 | 17.8 |
| headed | scripted | reduced | 1 | 161 | 0.24 / 0.40 / 0.70 | 0.13 / 0.20 / 0.30 | 0.01 / 0.10 / 0.10 | 0.01 / 0.10 / 0.10 | 231 / 1154 | 0.09 / 0.20 / 0.20 | 5.81 / 6.10 / 7.10 | 8.5 |
| headed | scripted | minimal | 1 | 161 | 0.23 / 0.40 / 0.60 | 0.12 / 0.20 / 0.30 | 0.01 / 0.10 / 0.10 | 0.01 / 0.10 / 0.10 | 154 / 1230 | 0.08 / 0.20 / 0.20 | 5.82 / 6.10 / 6.80 | 0.0 |
| headed | pointer-active | full | 2 | 162 | 0.31 / 0.50 / 0.90 | 0.18 / 0.30 / 0.40 | 0.02 / 0.10 / 0.10 | 0.02 / 0.10 / 0.10 | 1437 / 0 | 0.10 / 0.20 / 0.30 | 5.62 / 6.10 / 7.90 | 173.4 |
| headed | pointer-active | minimal | 1 | 161 | 0.26 / 0.40 / 0.60 | 0.14 / 0.20 / 0.30 | 0.02 / 0.10 / 0.10 | 0.01 / 0.10 / 0.10 | 156 / 1234 | 0.09 / 0.20 / 0.20 | 5.80 / 6.10 / 7.10 | 0.0 |

- `tick` is the main thread's view of one worker tick: a telemetry sample, two
  request/response round trips, and publish. It includes event-loop
  scheduling delay behind rendering.
- `tick-overrun` never appeared. Each window held 161 to 162 ticks in 8 s,
  which is the full 20 Hz.
- Pulse counts follow what the network did in each window. During the
  headless pointer window the buffer took 10,752 events over 176 steps (about
  61 per step); the scripted path is quieter. The level only caps drawing.
- Every window ended with at most 201 buffered events and `evicted: 0`. The
  ring holds 512.
- **Re-measured after the 1/4-speed display clock (#104 / RM-2353).** Events
  now retire 18 steps after arrival and the ring holds 2,048. A headless rerun
  of the same windows (Chrome 155, display at 240 Hz, so frame intervals were
  4.17 ms mean / 4.30 ms p95 throughout) ended with at most 1,289 buffered
  events (pointer-active) and `evicted: 0` in every window; the scripted
  windows ended with 0 to 257. Pulses per drawn frame rose as intended, since
  each pulse now lives 4 to 5 times longer: 58 (scripted, full), 99 (scripted,
  balanced), 24 (scripted, reduced) and 908 (pointer-active, full). Frame work
  stayed at 0.10–0.12 ms mean / 0.20 ms p95 / 0.30–0.60 ms max for the
  scripted windows and 0.20 / 0.30 / 0.40 ms for pointer-active at full, within
  R2. Tick, publish and spike-ingest times did not move (`tick` 0.31–0.40 ms
  mean, ingest ≤ 0.03 ms mean), and `usedJSHeapSize` ranged 5.8 to 9.8 MB.
- `usedJSHeapSize` at the end of each window ranged from 4.7 to 10.0 MB, with no
  upward trend across windows.

### 5. Render stress: synthetic topologies through the shipped renderer

This is the real `createTopologyRendererSeam` on a 960×540 CSS px surface. It
is fed fixture snapshots (`provenance: 'fixture'`, a ring lattice with delays
1 to 4) at 50 ms, with 25% of neurons spiking per step, and a 16,384-event
fixture ring. Each case is 4 s after a 0.5 s settle. Times are in ms. Neither
the topologies nor the spikes come from the live adapter.

| run | nodes | edges | events/step | level | DPR | pulses per drawn frame | drawn / skipped | frame work (mean / p95 / max) | frame interval (mean / p95) | spike ingest (mean / p95) |
|---|---:|---:|---:|---|---:|---:|---|---|---|---|
| headless | 16 | 64 | 16 | full | 1 | 47 | 693 / 0 | 0.11 / 0.20 / 0.30 | 5.78 / 6.10 | 0.013 / 0.10 |
| headless | 16 | 64 | 16 | balanced | 1 | 47 | 687 / 0 | 0.10 / 0.20 / 0.40 | 5.83 / 6.10 | 0.013 / 0.10 |
| headless | 16 | 64 | 16 | reduced | 1 | 47 | 115 / 575 | 0.11 / 0.20 / 0.30 | 5.81 / 6.10 | 0.004 / 0.00 |
| headless | 16 | 64 | 16 | minimal | 1 | 0 | 78 / 605 | 0.08 / 0.20 / 0.20 | 5.87 / 6.20 | 0.015 / 0.10 |
| headless | 64 | 512 | 128 | full | 1 | 390 | 692 / 0 | 0.14 / 0.20 / 0.30 | 5.79 / 6.20 | 0.019 / 0.10 |
| headless | 64 | 512 | 128 | balanced | 1 | 256 | 690 / 0 | 0.12 / 0.20 / 0.30 | 5.80 / 6.10 | 0.025 / 0.10 |
| headless | 64 | 512 | 128 | reduced | 1 | 96 | 114 / 570 | 0.11 / 0.20 / 0.30 | 5.85 / 6.10 | 0.018 / 0.10 |
| headless | 64 | 512 | 128 | minimal | 1 | 0 | 77 / 609 | 0.10 / 0.20 / 0.20 | 5.83 / 6.10 | 0.025 / 0.10 |
| headless | 256 | 4,096 | 1,024 | full | 1 | 3,153 | 696 / 0 | 0.37 / 0.50 / 0.90 | 5.75 / 6.10 | 0.094 / 0.20 |
| headless | 256 | 4,096 | 1,024 | balanced | 1 | 256 | 692 / 0 | 0.13 / 0.20 / 0.30 | 5.78 / 6.10 | 0.095 / 0.20 |
| headless | 256 | 4,096 | 1,024 | reduced | 1 | 96 | 114 / 574 | 0.11 / 0.20 / 0.30 | 5.82 / 6.10 | 0.086 / 0.20 |
| headless | 256 | 4,096 | 1,024 | minimal | 1 | 0 | 77 / 605 | 0.09 / 0.20 / 0.20 | 5.87 / 6.10 | 0.089 / 0.20 |
| headless | 1,024 | 32,768 | 8,192 | full | 1 | 15,541 | 698 / 0 | 1.09 / 1.40 / 1.90 | 5.73 / 6.10 | 0.441 / 0.70 |
| headless | 1,024 | 32,768 | 8,192 | balanced | 1 | 256 | 690 / 0 | 0.20 / 0.30 / 0.50 | 5.80 / 6.10 | 0.491 / 0.70 |
| headless | 1,024 | 32,768 | 8,192 | reduced | 1 | 96 | 114 / 572 | 0.16 / 0.30 / 0.40 | 5.83 / 6.10 | 0.441 / 0.70 |
| headless | 1,024 | 32,768 | 8,192 | minimal | 1 | 0 | 77 / 606 | 0.11 / 0.20 / 0.30 | 5.86 / 6.10 | 0.444 / 0.70 |
| headed | 16 | 64 | 16 | full | 2 | 47 | 702 / 0 | 0.11 / 0.20 / 0.30 | 5.70 / 6.10 | 0.019 / 0.10 |
| headed | 16 | 64 | 16 | balanced | 1.5 | 47 | 701 / 0 | 0.11 / 0.20 / 0.30 | 5.70 / 6.10 | 0.008 / 0.10 |
| headed | 16 | 64 | 16 | reduced | 1 | 48 | 115 / 575 | 0.13 / 0.20 / 0.30 | 5.80 / 6.10 | 0.010 / 0.10 |
| headed | 16 | 64 | 16 | minimal | 1 | 0 | 77 / 611 | 0.13 / 0.20 / 0.30 | 5.81 / 6.10 | 0.014 / 0.10 |
| headed | 64 | 512 | 128 | full | 2 | 390 | 699 / 0 | 0.14 / 0.20 / 0.30 | 5.73 / 6.10 | 0.028 / 0.10 |
| headed | 64 | 512 | 128 | balanced | 1.5 | 256 | 701 / 0 | 0.13 / 0.20 / 0.30 | 5.71 / 6.10 | 0.034 / 0.10 |
| headed | 64 | 512 | 128 | reduced | 1 | 96 | 115 / 575 | 0.11 / 0.20 / 0.30 | 5.80 / 6.10 | 0.010 / 0.10 |
| headed | 64 | 512 | 128 | minimal | 1 | 0 | 77 / 615 | 0.12 / 0.20 / 0.30 | 5.79 / 6.10 | 0.021 / 0.10 |
| headed | 256 | 4,096 | 1,024 | full | 2 | 3,154 | 698 / 0 | 0.37 / 0.50 / 0.70 | 5.72 / 6.10 | 0.101 / 0.20 |
| headed | 256 | 4,096 | 1,024 | balanced | 1.5 | 256 | 700 / 0 | 0.14 / 0.20 / 0.30 | 5.73 / 6.10 | 0.096 / 0.20 |
| headed | 256 | 4,096 | 1,024 | reduced | 1 | 96 | 115 / 574 | 0.13 / 0.20 / 0.30 | 5.81 / 6.10 | 0.084 / 0.20 |
| headed | 256 | 4,096 | 1,024 | minimal | 1 | 0 | 77 / 607 | 0.08 / 0.20 / 0.20 | 5.85 / 6.10 | 0.104 / 0.20 |
| headed | 1,024 | 32,768 | 8,192 | full | 2 | 15,515 | 703 / 0 | 1.07 / 1.40 / 2.00 | 5.70 / 6.10 | 0.438 / 0.60 |
| headed | 1,024 | 32,768 | 8,192 | balanced | 1.5 | 256 | 698 / 0 | 0.21 / 0.30 / 0.40 | 5.73 / 6.10 | 0.515 / 0.70 |
| headed | 1,024 | 32,768 | 8,192 | reduced | 1 | 96 | 114 / 571 | 0.17 / 0.30 / 0.40 | 5.84 / 6.10 | 0.495 / 0.70 |
| headed | 1,024 | 32,768 | 8,192 | minimal | 1 | 0 | 78 / 610 | 0.13 / 0.20 / 0.30 | 5.83 / 6.10 | 0.468 / 0.70 |

A review fix later changed which pulses a capped level draws: the most
recently emitted ones instead of the oldest. A 4 s-per-case headless rerun on
the final tree measured mean frame work at 1024 nodes of 1.11 ms (full,
15,534 pulses), 0.21 ms (balanced), 0.17 ms (reduced), and 0.11 ms (minimal),
in line with the table. At 64 nodes, balanced drew 243 pulses per frame rather
than 256. Some of the newest buffered events have short delays and have
already landed; the buffer retires them a fixed number of steps after arrival
(one at the time; 18 since the 1/4-speed display clock, see the re-measurement
below), and the cap counts buffered events rather than visible ones to avoid a
second pass.

The frame interval did not move at any size or DPR, so on this machine the
measured cost is main-thread draw time, and it tracks the pulses drawn: at
1024 nodes (headless), 1.09 ms with 15,541 pulses versus 0.20 ms with 256.
Spike ingestion is main-thread work that quality cannot reduce. It scales with
events per step and reaches 0.44 to 0.52 ms at 8,192 events.

#### Re-measured for the 1/4-speed display clock (#104 / RM-2353)

Same harness, same cases and machine, Chrome 155.0.8059.40 with the display at
240 Hz (every frame interval below is 4.17 ms mean / 4.30 ms p95, so the
measured cost is again main-thread draw time). Each pulse now stays on screen
4 to 5 times longer (`(d + 1.5) × 200 ms` instead of `(d + 0.6) × 50 ms`), so
at the full level many more pulses are drawn per frame; the capped levels draw
the same 256 / 96 / 0.

| run | nodes | edges | events/step | level | DPR | pulses per drawn frame | drawn / skipped | frame work (mean / p95 / max) | frame interval (mean / p95) | spike ingest (mean / p95) |
|---|---:|---:|---:|---|---:|---:|---|---|---|---|
| headless | 16 | 64 | 16 | full | 1 | 239 | 961 / 0 | 0.15 / 0.30 / 0.70 | 4.17 / 4.30 | 0.030 / 0.10 |
| headless | 16 | 64 | 16 | balanced | 1 | 217 | 961 / 0 | 0.16 / 0.30 / 0.40 | 4.17 / 4.30 | 0.026 / 0.10 |
| headless | 16 | 64 | 16 | reduced | 1 | 96 | 120 / 830 | 0.18 / 0.30 / 0.40 | 4.21 / 4.30 | 0.022 / 0.10 |
| headless | 16 | 64 | 16 | minimal | 1 | 0 | 80 / 866 | 0.13 / 0.20 / 0.30 | 4.23 / 4.30 | 0.025 / 0.10 |
| headless | 64 | 512 | 128 | full | 1 | 1,972 | 960 / 0 | 0.42 / 0.70 / 0.80 | 4.17 / 4.20 | 0.060 / 0.10 |
| headless | 64 | 512 | 128 | balanced | 1 | 256 | 961 / 0 | 0.17 / 0.30 / 0.40 | 4.17 / 4.30 | 0.064 / 0.20 |
| headless | 64 | 512 | 128 | reduced | 1 | 96 | 120 / 817 | 0.18 / 0.30 / 0.40 | 4.27 / 4.30 | 0.068 / 0.10 |
| headless | 64 | 512 | 128 | minimal | 1 | 0 | 80 / 857 | 0.12 / 0.20 / 0.30 | 4.27 / 4.30 | 0.059 / 0.10 |
| headless | 256 | 4,096 | 1,024 | full | 1 | 14,145 | 960 / 0 | 1.66 / 2.10 / 2.50 | 4.17 / 4.30 | 0.275 / 0.40 |
| headless | 256 | 4,096 | 1,024 | balanced | 1 | 256 | 960 / 0 | 0.33 / 0.50 / 0.60 | 4.17 / 4.30 | 0.245 / 0.30 |
| headless | 256 | 4,096 | 1,024 | reduced | 1 | 96 | 119 / 786 | 0.29 / 0.40 / 0.50 | 4.42 / 8.20 | 0.184 / 0.30 |
| headless | 256 | 4,096 | 1,024 | minimal | 1 | 0 | 79 / 826 | 0.21 / 0.30 / 0.40 | 4.42 / 8.20 | 0.166 / 0.30 |
| headless | 1,024 | 32,768 | 8,192 | full | 1 | 16,384 | 961 / 0 | 2.05 / 2.60 / 3.50 | 4.17 / 4.30 | 0.546 / 0.70 |
| headless | 1,024 | 32,768 | 8,192 | balanced | 1 | 256 | 960 / 0 | 0.80 / 1.10 / 1.30 | 4.17 / 4.30 | 0.496 / 0.60 |
| headless | 1,024 | 32,768 | 8,192 | reduced | 1 | 96 | 119 / 788 | 0.79 / 1.00 / 1.50 | 4.41 / 8.20 | 0.515 / 0.80 |
| headless | 1,024 | 32,768 | 8,192 | minimal | 1 | 0 | 80 / 842 | 0.69 / 1.00 / 1.20 | 4.35 / 4.30 | 0.524 / 0.70 |
| headed | 16 | 64 | 16 | full | 2 | 239 | 961 / 0 | 0.11 / 0.20 / 0.40 | 4.17 / 4.30 | 0.028 / 0.10 |
| headed | 16 | 64 | 16 | balanced | 1.5 | 217 | 960 / 0 | 0.13 / 0.20 / 0.40 | 4.17 / 4.30 | 0.026 / 0.10 |
| headed | 16 | 64 | 16 | reduced | 1 | 96 | 120 / 840 | 0.19 / 0.30 / 0.30 | 4.17 / 4.30 | 0.016 / 0.10 |
| headed | 16 | 64 | 16 | minimal | 1 | 0 | 80 / 880 | 0.17 / 0.20 / 0.30 | 4.17 / 4.30 | 0.025 / 0.10 |
| headed | 64 | 512 | 128 | full | 2 | 1,973 | 960 / 0 | 0.37 / 0.60 / 1.10 | 4.17 / 4.30 | 0.039 / 0.10 |
| headed | 64 | 512 | 128 | balanced | 1.5 | 256 | 961 / 0 | 0.14 / 0.30 / 0.30 | 4.17 / 4.30 | 0.069 / 0.10 |
| headed | 64 | 512 | 128 | reduced | 1 | 96 | 120 / 840 | 0.17 / 0.30 / 0.50 | 4.17 / 4.30 | 0.064 / 0.20 |
| headed | 64 | 512 | 128 | minimal | 1 | 0 | 80 / 880 | 0.16 / 0.20 / 0.30 | 4.17 / 4.30 | 0.061 / 0.10 |
| headed | 256 | 4,096 | 1,024 | full | 2 | 14,154 | 960 / 0 | 1.37 / 1.80 / 2.20 | 4.17 / 4.30 | 0.171 / 0.30 |
| headed | 256 | 4,096 | 1,024 | balanced | 1.5 | 256 | 960 / 0 | 0.26 / 0.40 / 0.70 | 4.17 / 4.30 | 0.170 / 0.30 |
| headed | 256 | 4,096 | 1,024 | reduced | 1 | 96 | 120 / 840 | 0.27 / 0.40 / 0.50 | 4.17 / 4.30 | 0.156 / 0.20 |
| headed | 256 | 4,096 | 1,024 | minimal | 1 | 0 | 80 / 881 | 0.25 / 0.30 / 0.40 | 4.17 / 4.30 | 0.128 / 0.20 |
| headed | 1,024 | 32,768 | 8,192 | full | 2 | 16,384 | 960 / 0 | 1.77 / 2.30 / 3.00 | 4.17 / 4.30 | 0.467 / 0.60 |
| headed | 1,024 | 32,768 | 8,192 | balanced | 1.5 | 256 | 960 / 0 | 0.73 / 1.00 / 1.30 | 4.17 / 4.30 | 0.412 / 0.50 |
| headed | 1,024 | 32,768 | 8,192 | reduced | 1 | 96 | 120 / 841 | 0.75 / 1.10 / 1.10 | 4.17 / 4.30 | 0.477 / 0.70 |
| headed | 1,024 | 32,768 | 8,192 | minimal | 1 | 0 | 80 / 881 | 0.63 / 0.80 / 0.80 | 4.17 / 4.30 | 0.472 / 0.70 |

- **Shipped topology (16 nodes), every level, headless and headed:** 0.11 to
  0.19 ms mean and 0.20 to 0.30 ms p95 frame work, with 239 pulses per frame at
  full (47 before). R2's 2 ms p95 holds with an order of magnitude to spare,
  and the frame cap (R6) and pulse caps (R5) behave as before: reduced and
  minimal drew 120 / 80 of about 960 animation frames.
- **64 nodes (the size RM-2355 proposes):** 0.37–0.42 ms mean, 0.60–0.70 ms
  p95 at full with about 1,970 pulses per frame; the capped levels stay at
  0.14–0.18 ms mean. Within R2.
- **Synthetic 256- and 1,024-node cases at full** now exceed 2 ms p95
  (2.1–2.6 ms; they were 0.5 and 1.4 ms) because the full level draws every
  buffered event and the 16,384-event stress ring is saturated at 1,024 nodes
  (the live ring is 2,048). These sizes are not shipped and R2 is defined for
  the shipped topology; the adaptive controller would not step down for them
  (its draw-time trigger is 8 ms mean), which is fine on this machine. A
  contract that grows the topology past 64 neurons should re-check the full
  level's pulse count against R2 (see S9).
- **Spike ingestion** did not change in cost per event: 0.03 ms at 16 events
  per step, 0.47–0.55 ms at 8,192. Retention affects only how long an event
  stays in the ring, not the per-step mapping.

This run used the 1024-node / 32,768-edge stress, with the controller left
unpinned and Chrome's main thread throttled 20× (headless, same machine), for
20 s.

| Measured | Value |
| --- | --- |
| Level changes | full → balanced at 2,379 ms; balanced → full (upshift) at 9,377 ms; full → balanced at 11,499 ms; no further change |
| Windows judged | 20 (2 downshifts, 1 upshift). Falling back right after the upshift doubled the required relief streak from 5 to 10 windows |
| Last window | p90 interval 12.1 ms, mean draw 3.03 ms per drawn frame: "relief" (stepping up again needs ten in a row) |
| Frame work over the run | p50 3.1, p95 6.6, p99 32.9, max 44.6 ms (2,092 drawn, 0 skipped) |
| Frame interval over the run | p50 6.0, p95 22.3, p99 47.2, max 70.0 ms |
| Spike ingest per step | mean 9.2, p50 8.5, p95 12.4, max 25.5 ms (375 steps) |

The controller stepped down 2.4 s into sustained pressure. It recovered to
full after five relieved windows, fell back about 2 s later, and from then on
needs ten relieved windows before trying again. That is the flap guard
working as designed. Balanced was enough to relieve this run.

The same scenario took different paths in two earlier runs on this machine
the same day, both on earlier revisions of #45's renderer: full → balanced
(2.3 s) → reduced (9.3 s); and full → balanced (2.5 s) → reduced (4.4 s) →
balanced (17.5 s) → reduced (19.5 s). Under 20× throttling this load sits
near the pressure threshold, so the exact path varies from run to run. In
every run, quality changed at most four times in 20 s. Spike ingestion
averaged 9.2 ms per step (median 8.5 ms) at this scale under throttling, and
no quality level touches it. That is why S9 caps topology growth.

### 7. Offscreen and background

These were measured live on the production page. Counters were reset after
each transition and read 3 s later (2 s for the second resume check).

| run | island scrolled out of view | window minimized (`document.visibilityState === 'hidden'`) | after returning |
| --- | --- | --- | --- |
| headless | 0 ticks, 0 frames | 0 ticks, 0 frames | 55 ticks / 495 frames (3 s), 40 ticks / 352 frames (2 s) |
| headed | 0 ticks, 0 frames | 0 ticks, 0 frames | 54 ticks / 484 frames (3 s), 40 ticks / 354 frames (2 s) |

"Hidden" is a real minimize through CDP `Browser.setWindowBounds`, not a
simulated event. `test/offscreen-pause.test.mjs` covers the same wiring in
`npm test`: the `IntersectionObserver` threshold, `visibilitychange`, resume,
and dispose. It uses the real fixed-cadence WASM seam.

### 8. Startup and payload

The payload is the production build of this branch on top of #48,
compressed by Node's zlib (gzip level 9, brotli quality 11). The harness
serves files uncompressed; production hosting is not configured. "Requested"
is what headless Chrome actually fetched from the harness server for `/`
(section 9).

| file | bytes | gzip | brotli | loaded |
| --- | ---: | ---: | ---: | --- |
| `three.module.*.js` | 746,881 | 191,104 | 155,725 | lazily, when the island goes live |
| `neuromorphic_adapter_bg.wasm` (default package) | 189,316 | 67,935 | 56,459 | lazily, in the worker |
| `NeuromorphicDemo…js` (island entry) | 57,562 | 18,066 | 16,028 | with the page |
| `neuromorphic_adapter.js` (default glue) | 17,150 | 3,161 | 2,798 | lazily, in the worker |
| `neuromorphic-worker-*.js` | 12,105 | 3,740 | 3,291 | lazily |
| **total, panel closed** | 1,023,014 | 284,006 | 234,301 | |
| `telemetry-view.*.js` (#48 panel) | 16,761 | 6,712 | 6,079 | only when a reader opens the panel |
| **total, panel opened** | 1,039,775 | 290,718 | 240,380 | |

The island entry grew from 55,865 to 57,562 bytes (+1,697; +546 brotli) with
#48's always-loaded `telemetry-entry.ts`, the cadence-cap wiring, and the
review fixes. The labs
package (`neuromorphic-adapter-labs`, 966,603 bytes of WASM) is never
requested by the homepage.

Startup marks below were recorded before the rebase onto #48 and were not
re-measured. They are in ms since navigation start, on localhost with a fresh
profile:

| run | island script ran | renderer ready | first frame | first snapshot |
| --- | ---: | ---: | ---: | ---: |
| headless | 67.6 | 205.4 | 218.2 | 275.7 |
| headed | 32.5 | 366.3 | 378.7 | 436.7 |

"First snapshot" includes the first 50 ms tick interval.

### 9. Telemetry panel under quality pressure

This was a sanity run on the final tree (after rebasing onto #48 and the
review fixes): headless Chrome 155.0.8059.40 on the same machine (renderer `ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 …
D3D11)`), 2026-10-09, production build, `/?neuromorphic-perf`. The panel
was opened while the demo was live, then the page's main thread was throttled
with `Emulation.setCPUThrottlingRate`. Each sample read the island's
`data-demo-quality` and the rate the panel itself reports in its status line
("refreshed at N Hz"), every 0.5 s while throttled and every 1 s after.

| Phase | Quality | Panel refresh |
| --- | --- | --- |
| Panel opened, unthrottled | full | 4 Hz (`telemetry-view` chunk fetched only now) |
| 20× throttle, 12 s | full throughout (every window "relief": p90 interval 6.1–16.3 ms, draw 1.3–2.4 ms) | 4 Hz |
| 60× throttle, 12 s | full → balanced → reduced → minimal (windows under "pressure": p90 interval 111–580 ms, draw 15–33 ms) | 4 → 4 → 2 → 1 Hz |
| Throttle removed | minimal → reduced → balanced → full over about 14 s | 1 → 2 → 4 → 4 Hz |

The homepage requested exactly the island entry, the worker, `three`, and the
default package (`/wasm/neuromorphic-adapter/…`). It made no request to
`neuromorphic-adapter-labs`, and there were no page errors. The panel's
reported rate trails a level change by up to one of its own refresh periods,
because its status line is redrawn by the same throttled flush.
`test/telemetry-quality.test.mjs` covers the same contract deterministically:
the cap is picked up on first open and on every change, it never raises the
panel above 4 Hz (or 1 Hz under reduced motion), and redraws slow down while
every step is still sampled.

### 10. Homepage hero (#13)

GitHub #13 / Linear RM-1649 moves the live island into the homepage hero (see
the hero section of [`browser-runtime.md`](browser-runtime.md#homepage-hero-github-13--linear-rm-1649)).
It adds no per-frame work: the renderer's frame path is unchanged (its layout
constants moved to `topology-layout.ts`), the static drawing is plain SVG that
nothing touches after load, and the plate's input indicator is CSS that reads
`data-demo-input-source`, which the WASM seam already wrote only when the
source changes. Viewport gating now follows the mesh and the telemetry panel
instead of the whole island.

Re-measured on the same machine on 2026-10-09 at 10:31 UTC with
`npm run perf:browser -- --browser <chrome> --seconds 8 --skip-bench --skip-stress`
on the production build of this branch (on top of #50, `c7ff9e5`; restacked
later onto `f5677b5` with an identical tree): headless
Chrome 155.0.8059.40, renderer `ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 …
D3D11)`, DPR 1, viewport 1244×795, served from `127.0.0.1` without
compression. The headed run was not repeated (see [Not measured](#not-measured)).
Times are mean / p95 / max in ms, quantized at 0.1 ms.

| scenario | level | DPR applied | ticks | tick | tick-step | publish | spike ingest | frames drawn / skipped | frame work | frame interval | pulses per drawn frame |
|---|---|---:|---:|---|---|---|---|---|---|---|---:|
| scripted, adaptive | full | 1 | 161 | 0.34 / 0.50 / 1.10 | 0.19 / 0.30 / 0.70 | 0.02 / 0.10 / 0.10 | 0.01 / 0.10 / 0.10 | 1462 / 0 | 0.09 / 0.20 / 0.30 | 5.53 / 6.10 / 6.70 | 14.5 |
| scripted | full | 1 | 162 | 0.36 / 0.50 / 0.70 | 0.19 / 0.30 / 0.40 | 0.01 / 0.10 / 0.10 | 0.01 / 0.10 / 0.10 | 1453 / 0 | 0.08 / 0.20 / 0.30 | 5.55 / 6.10 / 6.90 | 10.6 |
| scripted | balanced | 1 | 162 | 0.33 / 0.50 / 1.10 | 0.19 / 0.30 / 0.80 | 0.01 / 0.10 / 0.10 | 0.01 / 0.10 / 0.10 | 1455 / 0 | 0.08 / 0.20 / 0.20 | 5.55 / 6.10 / 6.90 | 17.5 |
| scripted | reduced | 1 | 161 | 0.23 / 0.40 / 1.00 | 0.13 / 0.20 / 0.60 | 0.01 / 0.10 / 0.10 | 0.00 / 0.00 / 0.10 | 229 / 1146 | 0.07 / 0.20 / 0.20 | 5.86 / 6.10 / 6.80 | 8.3 |
| scripted | minimal | 1 | 161 | 0.22 / 0.40 / 0.50 | 0.12 / 0.20 / 0.30 | 0.01 / 0.10 / 0.10 | 0.01 / 0.10 / 0.10 | 154 / 1220 | 0.07 / 0.20 / 0.20 | 5.87 / 6.10 / 7.10 | 0.0 |
| pointer-active | full | 1 | 162 | 0.33 / 0.50 / 2.10 | 0.19 / 0.30 / 1.90 | 0.02 / 0.10 / 0.10 | 0.02 / 0.10 / 0.10 | 1424 / 0 | 0.09 / 0.20 / 0.20 | 5.67 / 6.10 / 7.20 | 173.5 |
| pointer-active | minimal | 1 | 161 | 0.24 / 0.40 / 0.50 | 0.12 / 0.20 / 0.30 | 0.02 / 0.10 / 0.10 | 0.02 / 0.10 / 0.10 | 156 / 1228 | 0.08 / 0.20 / 0.20 | 5.83 / 6.10 / 6.60 | 0.0 |

- No tick overran, every window ended with `evicted: 0`, and every
  input-source sample in the pointer windows read `pointer` (the scripted
  windows read `scripted`). The numbers match section 4 within its spread.
- Startup, in ms since navigation start: DOMContentLoaded 83.9, renderer ready
  107.3, first frame 120.3, first snapshot 161.7. The island is now on the
  first screen of a desktop viewport, so it is eligible at load instead of
  after a scroll. On a phone, the mesh sits below the calls to action and
  nothing loads or runs until it scrolls in.
- Offscreen (the island scrolled out of view) and hidden (window minimized
  through CDP): 0 ticks and 0 frames over 3 s each, then 58 ticks / 516
  frames in 3 s and 40 ticks / 347 frames in 2 s after returning.
- The page reported no errors. Its only WASM requests were the default
  package's glue and `.wasm`; it never requested `neuromorphic-adapter-labs`
  (`npm run test:layout` now checks this on every validate run).

**Payload.** Same method as section 8 (Node zlib, gzip level 9, brotli quality
11). Vite now splits the island entry into an entry and a chunk it shares with
`/labs/plasticity/` (since #50); both load with the page.

| file | bytes | gzip | brotli | loaded |
| --- | ---: | ---: | ---: | --- |
| `three.module.*.js` | 746,881 | 191,104 | 155,725 | lazily, when the island goes live |
| `neuromorphic_adapter_bg.wasm` (default package) | 189,316 | 67,935 | 56,459 | lazily, in the worker |
| `NeuromorphicDemo…js` (island entry) | 43,026 | 13,598 | 12,265 | with the page |
| `spike-events.*.js` (shared chunk) | 15,841 | 5,377 | 4,715 | with the page |
| `neuromorphic_adapter.js` (default glue) | 17,150 | 3,161 | 2,798 | lazily, in the worker |
| `neuromorphic-worker-*.js` | 12,105 | 3,740 | 3,291 | lazily |
| **total, panel closed** | 1,024,319 | 284,915 | 235,253 | |
| `telemetry-view.*.js` + `demo-telemetry.*.js` (#48 panel) | 16,856 | 7,175 | 6,528 | only when a reader opens the panel |
| **total, panel opened** | 1,041,175 | 292,090 | 241,781 | |

Both payload tables were measured with the Rust 1.98.1 package. RM-2057 later
rebuilt the default package with Rust 1.99.0, and its `.wasm` is now 187,612
bytes, 1,704 fewer. Its glue is unchanged. See the size table in
[browser-runtime.md](browser-runtime.md#browser-build-profiles). The rows above
were not re-measured.

Against a build of the #50 head (`c7ff9e5`, since restacked as `f5677b5` with
an identical tree) on the same machine, the hero changes the homepage as
follows. The island entry grows by 350 bytes (124 brotli). The HTML grows from
19,149 to 25,393 bytes (3,662 to 4,798 brotli), almost all of it the static
drawing (64 lines and one path) and the crate trail, which are plain markup
with no script. The page's own stylesheet (`hero.css` with the telemetry
styles) grows from 4,474 to 8,866 bytes (1,046 to 1,959 brotli), and the
shared site stylesheet shrinks from 16,590 to 16,305 bytes once the old demo
section's rules are removed and the narrow-screen rules are consolidated.

**Layout stability.** A separate headless Chrome 155 session on the same
machine and build (a `layout-shift` and `largest-contentful-paint`
`PerformanceObserver` installed before navigation, read 1.8 s after load)
measured a cumulative layout shift of 0 at 1440, 1024, and 768 px wide, where
the demo went live, and at 375 and 320 px, where the mesh starts below the
fold. The largest contentful paint was the headline (`h1#hero-title`) at every
width. The same held with reduced motion, without WebGL
(`--disable-webgl --disable-3d-apis`), and with the WASM package blocked
(404).

### 11. Browser package release profile (#95)

Until 2026-10-25 the crate had no `[profile.release]`, so the browser packages
were built with cargo's release defaults: `opt-level = 3`, no LTO, 16 codegen
units. Every row below is the `wasm-bindgen --target web` output
`neuromorphic_adapter_bg.wasm` on this host (rustc 1.99.0, wasm-bindgen
0.2.126), compressed with Node's zlib (gzip level 9, brotli quality 11), for
the homepage (`default`) package and the labs package. The committed packages
before this change measured 187,612 and 982,555 bytes raw; the small
difference from the baseline row is host variation in the `.wasm`, which is
why `test:wasm-web-pkg` compares only the generated `.js` and `.d.ts`.

| `[profile.release]` | default raw | gzip | brotli | labs raw | gzip | brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| none (cargo's release defaults) | 189,874 | 68,253 | 56,757 | 983,095 | 265,992 | 199,897 |
| `opt-level = 3`, `lto = "fat"`, `codegen-units = 1` | 181,184 | 65,775 | 54,848 | 854,909 | 252,835 | 193,202 |
| the same plus `panic = "abort"` | 181,106 | 65,773 | 54,887 | 854,476 | 252,807 | 193,150 |
| **`opt-level = 2`, `lto = "fat"`, `codegen-units = 1` (chosen)** | **177,775** | **64,522** | **53,989** | **844,220** | **248,638** | **189,680** |
| `opt-level = "s"`, `lto = "fat"`, `codegen-units = 1` | 223,467 | 68,549 | 58,138 | 1,035,501 | 233,753 | 179,024 |
| the same plus `panic = "abort"` | 222,455 | 68,423 | 57,856 | 1,033,810 | 233,635 | 178,692 |
| `opt-level = "z"`, `lto = "fat"`, `codegen-units = 1` | 259,167 | 70,424 | 59,608 | 1,193,312 | 241,522 | 182,646 |

The size-oriented levels made the homepage package larger in every measure,
and `panic = "abort"` changes nothing measurable: `wasm32-unknown-unknown`
already aborts on panic. Fat LTO with one codegen unit shrinks both packages
at `opt-level = 3`, and `opt-level = 2` shrinks them further in every measure,
so that is the crate's release profile: the homepage package every visitor
downloads loses 3.7 KB gzipped (5.5%) and the labs package 17 KB (6.5%).
`opt-level = "s"` would take another 15 KB off the labs package but add 4 KB
to the homepage package, so it is not used; a per-package profile is possible
later if the labs package needs it. The simulation runs far inside its budgets
at any of these levels (sections 1 and 3), and `cargo test` uses the dev
profile, so nothing else moves. The generated `.d.ts` files change only in
the order of four `bigint` getters, which follows the linker's function
order.

### 12. Contract 7: 48 neurons (RM-2355)

RM-2355 moved the live demo to contract 7: 48 neurons with six synapses each
(288), on two rings. These numbers come from a different machine than the
reference desktop above, so they are not comparable row for row with
sections 1 to 11; the 16 / 64 rows in the native table below were re-run on
the same machine for scale.

| Item | Value |
| --- | --- |
| Machine | Linux virtual machine, 8 vCPUs of an Intel Xeon at 2.60 GHz, 15 GB RAM, no GPU |
| OS | Debian GNU/Linux 13 (trixie) |
| Browser | Chrome 156.0.8078.73 (Chrome for Testing), `--headless=new`, fresh profile, WebGL through SwiftShader (software rendering) |
| Node | 22.14.0 |
| Rust | 1.99.0, `--release` (the crate's profile: `opt-level = 2`, fat LTO) |
| Site build | `npm run build`, served by the harness's static server |
| Recorded | 2026-10-28 |

**Native pipeline, per stage** (`npm run perf:stages`, median of 15 runs ×
2000 ticks, µs per tick; the shipped `LifBankShaping` with
`ShapingProfile::V7`):

| input | mode | encoded spikes/tick | LIF spikes/tick | extract | encode | propagate | SNN step | materialize | input+step | p95 | p99 | max |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| scripted | delta | 2.88 | 7.06 | 0.071 | 0.087 | 0.404 | 30.554 | 0.100 | 32.885 | 52.979 | 69.160 | 132.761 |
| scripted | temporal | 0.05 | 5.31 | 0.071 | 0.197 | 0.150 | 30.700 | 0.089 | 31.496 | 51.678 | 66.683 | 150.968 |
| scripted | rate | 3.82 | 7.46 | 0.071 | 0.323 | 0.495 | 31.933 | 0.090 | 32.668 | 53.878 | 69.520 | 106.999 |
| pointer-active | delta | 6.83 | 8.18 | 0.073 | 0.121 | 0.671 | 31.689 | 0.089 | 32.923 | 46.460 | 64.891 | 187.526 |
| pointer-active | temporal | 4.39 | 7.07 | 0.071 | 0.275 | 0.454 | 31.013 | 0.089 | 31.984 | 36.710 | 53.343 | 88.032 |
| pointer-active | rate | 8.98 | 8.61 | 0.073 | 0.458 | 0.819 | 31.895 | 0.090 | 33.981 | 43.187 | 56.244 | 81.190 |
| pointer-idle | delta | 0.00 | 5.29 | 0.047 | 0.020 | 0.138 | 29.383 | 0.089 | 29.702 | 33.257 | 49.360 | 66.923 |
| pointer-idle | temporal | 0.00 | 5.29 | 0.047 | 0.182 | 0.138 | 29.313 | 0.089 | 30.200 | 34.024 | 47.894 | 69.314 |
| pointer-idle | rate | 2.00 | 6.57 | 0.047 | 0.145 | 0.289 | 30.174 | 0.089 | 31.248 | 50.940 | 60.352 | 134.519 |

The bank fires 5.3 to 8.6 of its 48 neurons per tick (11 to 18 %), inside the
5 to 20 % band `tests/sparse_firing.rs` holds it to. The `neuromod` step is
the whole cost, as before, and it is O(neurons × channels). The 30 µs here is
the shaped bank on the scripted workload; the like-for-like scaling figure is
in the next table, where the unshaped 48-neuron bank takes 48.2 µs against
5.5 µs for the unshaped 16-neuron bank at the same 10 % firing: about 8.7×
for 3× the neurons, with the fan-out rising from 4 to 6. `input` + `step` at
p95 is under 54 µs, which is 0.1 % of the 50 ms tick and 5 times inside S2's
desktop budget on a machine that is itself about 2.7× slower than the
reference desktop (its 16 / 64 SNN step takes 5.5 µs where the reference took
2.1 µs).

**Topology sizes through the same crates** (median of 7 runs × 400 ticks, 100
for ≥ 1024 neurons, µs per tick; the unshaped bank, as in section 2):

| neurons | fan-out | synapses | firing | events/tick | snapshot bytes | propagate | SNN step | materialize |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 16 | 4 | 64 | 10% | 6.4 | 2,192 | 0.074 | 5.538 | 0.158 |
| 16 | 4 | 64 | 50% | 32.1 | 2,216 | 0.166 | 5.915 | 0.154 |
| **48** | **6** | **288** | 10% | 28.9 | 9,212 | 0.219 | 48.202 | 0.376 |
| **48** | **6** | **288** | 50% | 144.3 | 9,288 | 0.692 | 48.242 | 0.382 |
| 64 | 8 | 512 | 10% | 51.3 | 15,968 | 0.338 | 85.567 | 0.451 |
| 64 | 8 | 512 | 50% | 256.3 | 16,072 | 1.237 | 98.319 | 0.443 |
| 256 | 16 | 4,096 | 10% | 409.7 | 123,056 | 2.149 | 1,378.909 | 3.180 |
| 256 | 16 | 4,096 | 50% | 2,048.5 | 123,464 | 8.151 | 1,378.385 | 3.237 |
| 1024 | 32 | 32,768 | 10% | 3,277.4 | 967,136 | 14.805 | 22,320.885 | 59.251 |
| 1024 | 32 | 32,768 | 50% | 16,384.0 | 968,776 | 62.305 | 22,399.453 | 64.799 |
| 2048 | 32 | 65,536 | 10% | 6,554.9 | 1,934,204 | 29.649 | 88,034.821 | 142.385 |
| 2048 | 32 | 65,536 | 50% | 32,769.9 | 1,937,480 | 126.012 | 90,423.080 | 136.293 |

"Snapshot bytes" is the contract-5 shape (the projection in every step); on
contract 7 the projection crosses once (about 9.2 KB) and a per-step snapshot
carries 256 to 448 bytes (48 potentials, 16 features, up to 48 spikes).

**Headless Chrome** (`npm run build && npm run perf:browser -- --browser <chrome> --seconds 8`,
2026-10-28 06:16 UTC, Chrome 156.0.8078.73 `--headless=new`, DPR 1, viewport
1280×757). WebGL ran on SwiftShader (`ANGLE (Google, Vulkan 1.3.0 (SwiftShader
Device (Subzero)))`), that is software rasterization on the same 8 vCPUs that
run the page and the worker, and headless Chrome paced frames at 60 Hz
(16.7 ms), unlike the 170 to 240 Hz of the reference desktop. Read the frame
numbers with that in mind: "frame work" is the main thread's draw time, as
before, but on this machine the rasterization cost also shows up as frame
interval.

**Live page** (`/?neuromorphic-perf` on the production build, 8 s windows after a 0.4 s settle, the real worker and renderer; mean / p95 / max in ms, quantized at 0.1 ms):

| scenario | level | DPR | ticks | tick | tick-step | publish | spike ingest | frames drawn / skipped | frame work | frame interval | pulses per drawn frame | buffered at end / evicted |
|---|---|---:|---:|---|---|---|---|---|---|---|---:|---|
| scripted-adaptive | full (adaptive) | 1 | 160 | 0.97 / 1.10 / 9.60 | 0.56 / 0.60 / 8.90 | 0.08 / 0.20 / 0.20 | 0.06 / 0.10 / 0.20 | 481 / 0 | 0.40 / 0.60 / 1.70 | 16.67 / 16.70 / 16.80 | 461.6 | 632 / 0 |
| scripted | full | 1 | 161 | 6.47 / 33.20 / 63.30 | 4.61 / 16.70 / 44.70 | 0.09 / 0.20 / 0.20 | 0.08 / 0.20 / 0.20 | 481 / 0 | 0.37 / 0.50 / 1.30 | 16.84 / 16.70 / 50.00 | 469.7 | 656 / 0 |
| scripted | balanced | 1 | 161 | 8.41 / 11.90 / 17.20 | 5.34 / 11.00 / 16.80 | 0.09 / 0.20 / 0.30 | 0.08 / 0.20 / 0.20 | 482 / 0 | 0.29 / 0.40 / 0.50 | 16.67 / 16.80 / 16.80 | 256.0 | 655 / 0 |
| scripted | reduced | 1 | 161 | 3.27 / 7.90 / 10.10 | 0.46 / 0.50 / 6.60 | 0.09 / 0.20 / 0.30 | 0.08 / 0.20 / 0.30 | 240 / 241 | 0.29 / 0.40 / 0.60 | 16.67 / 16.70 / 16.80 | 96.0 | 612 / 0 |
| scripted | minimal | 1 | 160 | 0.78 / 1.00 / 1.30 | 0.35 / 0.50 / 0.60 | 0.09 / 0.20 / 0.30 | 0.08 / 0.20 / 0.20 | 160 / 320 | 0.25 / 0.40 / 0.50 | 16.67 / 16.70 / 16.80 | 0.0 | 638 / 0 |
| pointer-active | full | 1 | 160 | 0.92 / 1.00 / 14.50 | 0.44 / 0.50 / 14.20 | 0.08 / 0.20 / 0.20 | 0.07 / 0.20 / 0.20 | 479 / 0 | 0.39 / 0.50 / 1.20 | 16.70 / 16.70 / 33.30 | 623.3 | 872 / 0 |
| pointer-active | minimal | 1 | 160 | 0.77 / 1.00 / 1.20 | 0.36 / 0.50 / 0.60 | 0.11 / 0.20 / 0.30 | 0.09 / 0.20 / 0.20 | 160 / 321 | 0.24 / 0.30 / 0.40 | 16.67 / 16.80 / 16.80 | 0.0 | 845 / 0 |

Startup, in ms since navigation start: DOMContentLoaded 46.2, renderer ready 152.8, first frame 185.8, first snapshot 215.4. Offscreen: {} then 54 ticks / 165 frames after returning; hidden (minimized): {} then 41 ticks / 120 frames. Page errors: 0.

**WASM ↔ JS boundary** (`boundary-bench.mjs` in the page, contract 7, median of 7 runs × 2000 ticks, µs per tick):

| input | mode | raw input | raw input+step | raw state() | getters | bridge state() | bridge tick | worker tick | spike ingest | LIF spikes/tick | events/tick | snapshot bytes |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| scripted | delta | 1.1 | 58.05 | 0.5 | 4.15 | 8.7 | 60 | 288.55 | 46.7 | 7.06 | 42.36 | 292 |
| scripted | temporal | 0.8 | 47.4 | 0.45 | 5 | 7.8 | 55.45 | 291.15 | 31.75 | 5.31 | 31.84 | 292 |
| scripted | rate | 0.75 | 49.6 | 0.45 | 3.5 | 7.25 | 57.5 | 289.05 | 44.65 | 7.46 | 44.75 | 288 |
| pointer-active | delta | 0.65 | 51.35 | 0.45 | 3.65 | 7.65 | 60.75 | 286.6 | 50.15 | 8.18 | 49.05 | 296 |
| pointer-active | temporal | 0.85 | 50 | 0.4 | 3.75 | 7.55 | 59 | 292.1 | 42.95 | 7.07 | 42.43 | 304 |
| pointer-active | rate | 0.95 | 52 | 0.4 | 3.7 | 7.9 | 61.3 | 305.1 | 53.5 | 8.61 | 51.65 | 300 |

WASM linear memory over 5000 synchronous steps: 1,245,184 B → 4,915,200 B without `free()`, +0 B with it (the shipped bridge).

**Render stress through the shipped renderer** (`npm run perf:browser -- --skip-live --skip-bench`,
re-run 2026-10-28 06:49 UTC after review: fixture snapshots at 50 ms, 25 % of
neurons spiking per step, 4 s per case; the 48 / 288 rows draw the audited
contract-7 edges and delays, the other sizes are synthetic ring lattices; none
of the spikes come from the live adapter):

| nodes | edges | events/step | level | DPR | pulses per drawn frame | drawn / skipped | frame work (mean / p95 / max) | frame interval (mean / p95) | spike ingest (mean / p95) |
|---:|---:|---:|---|---:|---:|---|---|---|---|
| 16 | 64 | 16 | full | 1 | 238 | 241 / 0 | 0.27 / 0.40 / 1.10 | 16.67 / 16.70 | 0.027 / 0.10 |
| 16 | 64 | 16 | balanced | 1 | 216 | 240 / 0 | 0.26 / 0.40 / 2.40 | 16.67 / 16.70 | 0.021 / 0.10 |
| 16 | 64 | 16 | reduced | 1 | 96 | 120 / 120 | 0.22 / 0.30 / 0.60 | 16.67 / 16.80 | 0.036 / 0.10 |
| 16 | 64 | 16 | minimal | 1 | 0 | 80 / 160 | 0.21 / 0.30 / 0.50 | 16.67 / 16.70 | 0.031 / 0.10 |
| **48** | **288** | 72 | full | 1 | 1,009 | 240 / 0 | 0.37 / 0.50 / 0.90 | 16.67 / 16.80 | 0.075 / 0.20 |
| **48** | **288** | 72 | balanced | 1 | 256 | 240 / 0 | 0.20 / 0.30 / 0.50 | 16.67 / 16.70 | 0.070 / 0.10 |
| **48** | **288** | 72 | reduced | 1 | 96 | 120 / 120 | 0.19 / 0.30 / 0.80 | 16.67 / 16.70 | 0.066 / 0.20 |
| **48** | **288** | 72 | minimal | 1 | 0 | 80 / 160 | 0.18 / 0.30 / 0.30 | 16.67 / 16.70 | 0.063 / 0.10 |
| 64 | 512 | 128 | full | 1 | 1,954 | 166 / 0 | 0.51 / 0.60 / 1.00 | 24.10 / 33.40 | 0.096 / 0.20 |
| 64 | 512 | 128 | balanced | 1 | 256 | 240 / 0 | 0.21 / 0.30 / 0.40 | 16.67 / 16.70 | 0.110 / 0.20 |
| 64 | 512 | 128 | reduced | 1 | 96 | 120 / 120 | 0.20 / 0.30 / 1.00 | 16.67 / 16.70 | 0.095 / 0.20 |
| 64 | 512 | 128 | minimal | 1 | 0 | 80 / 160 | 0.16 / 0.20 / 0.30 | 16.67 / 16.70 | 0.123 / 0.20 |
| 256 | 4,096 | 1,024 | full | 1 | 11,429 | 32 / 0 | 2.68 / 4.20 / 4.40 | 129.16 / 166.70 | 0.600 / 0.90 |
| 256 | 4,096 | 1,024 | balanced | 1 | 256 | 89 / 0 | 0.37 / 0.50 / 0.50 | 45.32 / 50.10 | 0.715 / 1.20 |
| 256 | 4,096 | 1,024 | reduced | 1 | 96 | 92 / 0 | 0.33 / 0.50 / 0.50 | 44.02 / 50.10 | 0.529 / 0.80 |
| 256 | 4,096 | 1,024 | minimal | 1 | 0 | 80 / 81 | 0.25 / 0.30 / 0.40 | 25.05 / 33.40 | 0.564 / 0.70 |
| 1024 | 32,768 | 8,192 | full | 1 | 15,116 | 13 / 0 | 4.55 / 7.10 / 7.10 | 347.42 / 383.30 | 1.156 / 1.30 |
| 1024 | 32,768 | 8,192 | balanced | 1 | 256 | 14 / 0 | 1.23 / 1.80 / 1.80 | 285.70 / 349.90 | 1.789 / 2.80 |
| 1024 | 32,768 | 8,192 | reduced | 1 | 96 | 14 / 0 | 1.37 / 2.40 / 2.40 | 292.85 / 333.30 | 1.490 / 2.00 |
| 1024 | 32,768 | 8,192 | minimal | 1 | 0 | 15 / 0 | 1.20 / 1.90 / 1.90 | 296.66 / 333.40 | 1.550 / 3.00 |

An earlier run of the same table on the same day, with a synthetic 48 / 6
lattice instead of the audited edges, measured the 48-node full level at
0.59 / 0.90 / 1.20 ms frame work with 23.9 / 33.4 ms intervals (169 of about
240 frames drawn), so the full-level pacing of this size sits near the edge
of what SwiftShader manages on this machine and varies between runs; the
capped levels were identical in both runs.

**Payload** (Node zlib, gzip level 9, brotli quality 11, the files the homepage loads):

| file | bytes | gzip | brotli |
| --- | ---: | ---: | ---: |
| `NeuromorphicDemo.astro_astro_type_script_index_0_lang.CMuTh_eJ.js` | 47,933 | 15,105 | 13,620 |
| `neuromorphic-worker-BTrRuev1.js` | 22,705 | 6,625 | 5,555 |
| `spike-events.D_Zdeicz.js` | 25,473 | 8,213 | 6,908 |
| `three.module.iOYB3rD4.js` | 746,881 | 191,104 | 155,725 |
| `neuromorphic_adapter.js` | 20,750 | 3,520 | 3,081 |
| `neuromorphic_adapter_bg.wasm` | 189,488 | 67,892 | 56,359 |
| **total, panel closed** | 1,053,230 | 292,459 | 241,248 |

What the run shows against the targets:

- **S1, S5 (cadence, overruns):** every 8 s window held 160 or 161 ticks and
  no `tick-overrun` was counted. The main thread's view of a tick (`tick`,
  two worker round trips plus publish) varied between windows, 0.8 to 8.4 ms
  mean and up to 63 ms max in the pinned `scripted / full` window, where the
  worker's reply waited behind SwiftShader frames on the shared CPUs; the
  adaptive and pointer windows sat at about 1 ms mean / 1.1 ms p95. None of
  that moved the 50 ms simulation clock.
- **S2, S3, S4:** raw `input` + `step` is 47 to 58 µs median in Chrome (about
  12× the 16-neuron figure on the reference desktop, on a machine whose
  native step is 2.7× slower), the bridge's `state()` is 7.3 to 8.7 µs, and
  the worker round trip 287 to 305 µs. All inside their budgets.
- **S7:** the ring is 8,192 and the live windows ended with 612 to 872 events
  buffered and `evicted: 0` everywhere; the bank fired 5.3 to 8.6 neurons per
  tick, 32 to 52 events per tick. Spike ingestion costs 32 to 54 µs per tick
  in the microbenchmark (0.06 to 0.09 ms mean on the live page), main-thread
  work that quality cannot reduce.
- **S8:** WASM linear memory flat with `free()` (+0 B over 5000 steps);
  `usedJSHeapSize` 7.5 MB at the end of the first window.
- **R2 (draw time, shipped topology, full):** 0.37 to 0.40 ms mean and
  0.5 to 0.6 ms p95 on the live page with 460 to 620 pulses per frame, and
  0.59 / 0.90 ms in the 25 %-firing stress row (979 pulses per frame). Within
  the 2 ms p95 target at every level.
- **R1 (frame pacing):** the live page held 16.7 ms p95 at every level, and
  so did the 48 / 288 stress rows with the audited edges, at every level,
  with 1,009 pulses per frame at full. The 64-node synthetic row at full did
  not (33.4 ms p95, 166 of about 240 frames drawn), and an earlier 48-node run
  with a synthetic lattice did not either (see the note under the table),
  because SwiftShader rasterizes the pulse quads on the CPU that also runs
  the page. On the reference desktop's GPU the 64 / 512 stress row drew 1,970
  pulses per frame at 4.2 ms intervals (section 5), so this is a property of
  software rendering, not of the topology; a GPU-backed run of the 48 / 288
  row is listed under [Not measured](#not-measured). The adaptive controller
  would see this pressure as p90 interval > 22.2 ms and step down, which is
  its job.
- **R5, R6, R8:** the capped levels drew 256 / 96 / 0 pulses and 240 / 120 / 80
  of about 240 frames in the stress rows, as designed; offscreen and
  minimized windows counted 0 ticks and 0 frames, then resumed.
- **R9, R10:** the homepage payload with the panel closed is 241,248 bytes
  brotli (the limit is 250 KB; it was 235,253): the island entry grew by
  1,355 bytes brotli with the contract-7 projection constants and the
  per-contract bridge, the spike-events chunk by 2,193 (it now imports the
  generated projection to size the ring), and the `.wasm` by 1,876 bytes raw
  (both topology specs are compiled in). First snapshot at 215 ms after
  navigation start, headless, from localhost.

**Deciding 48 or 64.** The plan said to start at 48, measure, and go to 64
only if every budget held with margin. Simulation cost is not the constraint
(a 64 / 512 step is 86 to 98 µs native here, still 0.2 % of the tick), and
the capped levels are indifferent to size. What is not established is the
full level on a real GPU at 48 (this run's GPU is software) and on low-end
hardware (never measured, below); the full-level stress row at 64 missed R1
on this machine in both runs, and the 48-node row held it only in the run
with the audited edges. 48 ships; 64 stays a follow-up gated on a GPU
measurement of the full level and on S7 at 16,384 ring entries (the pulse
buffers would be 2.75 MB).

## Simulation versus rendering

- **At the shipped size (16 / 64 when measured; 48 / 288 since RM-2355, see section 12), neither is a bottleneck.** The largest
  per-step cost is messaging: the worker round trip takes 66.5 to 72.2 µs, and
  the bridge 12 to 13 µs, both of which happen off the render path. Inside WASM,
  when at least 15 LIF neurons fire per tick, the `neuromod` step is 68 to 73% of
  `input` + `step` natively and 78 to 83% under WASI. Rendering takes 0.1 ms of
  CPU per frame.
- **Growth hits the simulation first.** The LIF bank is quadratic: 0.8 to
  0.9 ms per WASM step at 256 neurons, 12 to 13 ms at 1024, and over 50 ms at
  2048. Rendering the same synthetic sizes stays under 2 ms p95 per frame at
  full quality. Two costs grow with the simulation and are not adaptive:
  main-thread spike ingestion (0.44 to 0.52 ms per step at 8,192 events), and the
  contract-5 snapshot re-sending the full topology every step (~0.97 MB at
  1024 neurons).
- **Quality controls only help rendering**, which is the intent. They never
  change what is simulated.

## Adaptive quality

`src/runtime/adaptive-quality.ts` keeps one controller per island, created in
`live-seams.ts` and passed only to the renderer seam.

| level | name | DPR cap | pulses drawn | frame cap | telemetry ceiling | live telemetry panel (#9) |
| ---: | --- | ---: | --- | --- | --- | --- |
| 0 | full | 2 | all buffered (ring capacity) | every animation frame | every step (50 ms, 20 Hz) | 4 Hz |
| 1 | balanced | 1.5 | 256 | every animation frame | every 2 steps (100 ms, 10 Hz) | 4 Hz |
| 2 | reduced | 1 | 96 | 30 fps | every 10 steps (500 ms, 2 Hz) | 2 Hz |
| 3 | minimal | 1 | 0 (off) | 20 fps (one per step) | every 20 steps (1 s, 1 Hz) | 1 Hz |

The panel column applies with motion allowed. Under reduced motion the panel
stays at 1 Hz at every level.

- **Signal.** The renderer reports every animation-frame callback: the interval
  since the previous one, and its own draw time (0 when the frame cap skipped
  drawing). Windows of at least 1 s and 10 frames are judged on their p90
  interval and mean draw time, against the thresholds in R3. Intervals over
  1 s, such as a resume or a stall, reset the window instead of counting.
- **What never adapts.** The 50 ms tick, the input packets (pointer or scripted),
  the WASM session, and the spike-event buffer (every event is still buffered and
  delivered to subscribers) are outside the controller.
  `test/performance-semantics.test.mjs` runs the shipped WASM seam on the real
  WASM package for 200 ticks, in every encoder mode, with scripted and pointer
  input. It runs once plainly and once with the controller under synthetic frame
  pressure and pinned level changes, plus a pulse-cap reader, a cadence sampler,
  and the perf probe. Snapshots, spike batches, and the recorded trace must be
  byte-identical. For the shipped temporal mode, the trace must also replay from
  `init` to the same snapshots. The same file statically checks that no
  simulation-path module imports `adaptive-quality`.
- **Not adapted:** node count, which belongs to the simulation contract, and
  simulation frequency. Changing the tick period would change which pointer
  positions are latched, and with them the outputs, and it would break the
  `d × 50 ms` delay mapping.
- **Telemetry cadence API (for #9 and #13).** The island carries
  `data-demo-quality` (`full`, `balanced`, `reduced`, or `minimal`) and
  `data-demo-telemetry-cadence-ms`. In code, `renderer.quality` on the live
  seams is the controller's read side (`current()`, `subscribe()`, `stats()`),
  and `shouldSampleTelemetry(step, cadenceSteps)` picks the same simulation
  steps for every consumer. `telemetryCadenceMs(settings)` and
  `telemetryCadenceHz(settings)` convert the cadence. Cadence is keyed to
  steps, never to frames.
- **Live telemetry panel (#9).** `live-seams.ts` registers the quality
  cadence as a ceiling with `registerTelemetryCadenceCap` in
  `telemetry-entry.ts`. When a reader first opens the panel, its controller
  picks up the current ceiling, then follows every level change through
  `setCadenceCapHz`. The panel's effective rate is the minimum of its own
  cadence (4 Hz), the reduced-motion cap (1 Hz), and the quality ceiling, so
  quality can only lower it. Sampling still happens on every step; only
  redraws slow down.
- **Inspection.** Under `astro dev`, or on any build with `?neuromorphic-perf`,
  `globalThis.__neuromorphicPerf` exposes `summary()`, `reset()`, `quality()`,
  `forceQuality(level | null)`, `renderer()`, and `spikeEvents()`. Without the
  flag no probe exists, and each instrumented site is a single null check. The
  only always-on cost is two `performance.now()` calls per animation frame,
  which feed the controller.

## Buffer audit

Every buffer on the simulation, transfer, telemetry, and renderer paths, and
its bound:

| Path | Buffer | Bound | Status |
| --- | --- | --- | --- |
| Rust adapter | `pending_source_spikes`, `last_spikes`, `encoder_features` | 48, 48 and 16 entries (16, 16 and 16 on contracts 3 to 6), replaced every step | bounded |
| Rust adapter | topology arrays and `TopologyProjection` | fixed at construction (49 offsets, 288 edges on contract 7; 17 and 64 before) | bounded |
| `kinetic-signals` | `KineticExtractor` EMAs and `VolEstimator` | scalars, plus one 16-slot ring | bounded |
| `axon-encoder` | delta `last_values`, temporal `history`, rate `phases` and `pending_spikes` | 16 per channel; temporal pops at depth 6; the rate backlog is a saturating counter with capped emission per step | bounded |
| `synaptic-wiring` | `SpikeDelayBuffer` | ring of neurons × (max delay + 1) = 48 × 5 (16 × 5 on contracts 3 to 6) | bounded |
| `neuromod` | weights, eligibility, `predictive_state`, `input_spike_times` | 48 × 48 and 48 (16 × 16 and 16 before); no history kept | bounded |
| WASM ↔ JS | `WasmState` handle per step | was freed only by `FinalizationRegistry`, growing until a GC ran: 13.6 MB per 5000 steps, 477 MB in a long benchmark | **fixed:** freed right after reading (+0 B per 5000 steps) |
| Bridge | routed-topology verification cache | one entry (8 small arrays) | bounded |
| Worker engine | `pending` request map | at most one tick in flight (the driver's `inFlight` guard); cleared on failure | bounded |
| Simulation channel | latest snapshot plus listener set | one snapshot | bounded |
| Telemetry | `createTelemetryRecorder` | 6000 ticks (5 min), then it stops and `trace()` returns `null` | bounded |
| Telemetry | pointer telemetry, `latestFrame`, dev inspectors | latest packet or frame only; `recent(limit)` slices | bounded |
| Probe (opt-in) | per-stage samples, counters, marks | `Float64Array(2048)` ring per stage; fixed names | bounded |
| Adaptive quality | window samples, listeners | `Float64Array(512)`; one listener per subscriber | bounded |
| Spike events | `SpikeEventBuffer` ring | 8,192 events since RM-2355 (2,048 for 16 / 64, 512 before that), derived from the live topology's worst case of 288 × (4 + 18 + 1) = 6,624; retired 18 steps after arrival (the slowed pulse's lifetime on a 4-step edge; was 1), cleared on pause and dispose | bounded |
| Renderer | pulse vertex attributes | preallocated: 8,192 × 6 vertices × 7 floats ≈ 1.38 MB (344 KB at 2,048, 86 KB at 512) | bounded |
| Renderer | landing-glow levels | one `Float32Array(nodeCount)`, replaced on topology rebuild, zeroed per frame | bounded |
| Renderer | node and edge geometry | were appended to `disposables` on every topology rebuild | **fixed:** only the current pair is held |
| Renderer | `spikeFlash` map | keyed by neuron id; now cleared on rebuild | **fixed** (was bounded only by the largest topology seen) |
| Renderer | device-pixel-ratio media-query listener | the old inline version added a listener on each DPR change without removing the previous one | **fixed:** `watchDevicePixelRatio` keeps exactly one (tested) |
| Renderer | `ResizeObserver`, three.js resources | one per session, released on dispose | bounded |
| Runtime and binding | snapshot listeners, DOM listeners, `IntersectionObserver` | removed on dispose (tested) | bounded |

## Reproducing

```bash
npm ci

# 1. Rust per-stage and synthetic scaling (native)
npm run perf:stages            # add `-- --json` for JSON, `-- --quick` for a smoke run

# 2. The same harness as WASM, executed by Node's V8
rustup target add wasm32-wasip1 --toolchain 1.99.0
cargo +1.99.0 build --release --locked --target wasm32-wasip1 \
  --manifest-path crates/neuromorphic-adapter/Cargo.toml --example stage_bench
node scripts/perf/run-wasi-stage-bench.mjs \
  crates/neuromorphic-adapter/target/wasm32-wasip1/release/examples/stage_bench.wasm

# 3. WASM ↔ JS boundary in Node (committed package, shipped bridge)
npm run perf:boundary          # `-- --json`, `-- --ticks N --repeats N`, `-- --bridge <file.ts>`

# 4. Chrome: live page, boundary (with the real worker), render stress
npm run build
npm run perf:browser -- --browser "<path to chrome>" --seconds 8 --out headless.json
npm run perf:browser -- --browser "<path to chrome>" --headed --seconds 8 --out headed.json
npm run perf:browser -- --browser "<path to chrome>" --skip-live --skip-bench --skip-stress --cpu-throttle 20
#    Compare a bridge revision (the "before" rows):
git show <rev>:src/runtime/neuromorphic-adapter.ts > /tmp/bridge-before.ts
npm run perf:browser -- --browser "<path to chrome>" --skip-live --skip-stress --bridge /tmp/bridge-before.ts

# 5. By hand: open http://localhost:4321/?neuromorphic-perf after `npm run preview`
#    and call __neuromorphicPerf.summary() / .forceQuality(2) in the console.
```

All of these depend on the machine and run for minutes. None runs in `npm test`
or CI. `npm test` covers the deterministic parts instead: the quality state
machine and probe (`test/adaptive-quality.test.mjs`), output equivalence and
the bridge transfer path (`test/performance-semantics.test.mjs`), offscreen
pausing (`test/offscreen-pause.test.mjs`), and a smoke run of the boundary
harness (`test/perf-harness.test.mjs`). Coverage excludes `scripts/perf/**` and
`crates/**/examples/**`.

## Not measured

- **Mobile and low-end hardware.** No phone, tablet, or integrated-GPU laptop
  was available. The low-end targets in S2 and R2 are design decisions only. The
  20× CPU throttle throttles Chrome's page main thread on a desktop. It is not
  a mobile device, and it is not established here whether it slows workers.
- **Other browsers.** Firefox, Safari, and Edge were not run.
- **Headed run of the homepage hero (#13).** Section 10 is headless only; a
  headed run would have opened a visible window on a shared desktop. The
  hero changes neither the renderer's frame path nor the worker path.
- **Contract 7 on a GPU, headed, and at 64 neurons (RM-2355).** Section 12
  was measured on a Linux VM with SwiftShader (software WebGL) and headless
  only; its full-level stress row at 64 nodes exceeds R1 there (and the
  48-node row did in one of two runs) because rasterization competes with
  the page for the same CPUs. The
  reference desktop was not available for this change, so the 48 / 288
  render-stress row has no GPU-backed frame-interval measurement, no headed
  run, and the 64 / 8 topology was not built or measured on the live path.
- **GPU time.** `EXT_disjoint_timer_query_webgl2` is present. In an earlier
  headless run on this machine (before rebasing onto the current #45 head),
  per-frame values from a wrapped animation frame did not track the workload:
  0.003 ms per drawn frame with 15,523 pulses at 1024 nodes, but 0.85 ms with
  pulses off. So no GPU time is published. The harness keeps the
  wrapper behind `--gpu-timer` for future validation. GPU pressure is visible
  only through the frame interval, which never moved here.
- **Display-locked pacing.** Chrome's frame cadence was about 170 to 180 Hz in
  both modes on a 239 Hz display. Frame budgets at 60 Hz and 120 Hz were not
  measured on real panels.
- **Telemetry panel draw cost (#9).** The panel from #48 now sits under
  this branch, but its per-flush DOM and canvas cost was not timed here. The
  measurements in sections 3 to 7 have the panel closed, so their only
  per-tick telemetry work is the `onFrame` hook (`telemetry` stage, mean
  0.0012 to 0.0062 ms, from samples quantized at 0.1 ms). Section 9 shows the
  panel following quality, not what one flush costs.
- **Network.** Assets were served from localhost without compression or CDN
  latency. Hosting is not configured (`README.md`).
- **Power and thermals.** Battery, thermal throttling, and long sessions over
  10 minutes were not measured.
- **Worker-side breakdown in the live page.** The live probe sees worker ticks
  as round trips. The in-worker split comes from the microbenchmarks
  (sections 1 and 3).

## Follow-ups this data suggests

- ~~A future contract version could send the static topology projection once,
  not in every snapshot.~~ Done as contract 6 (#95): the projection crosses the
  WASM boundary and the worker boundary once, every snapshot shares it, and a
  per-step snapshot carries 128 to 192 bytes instead of 2,184 to 2,248, with
  identical spikes step for step (`tests/trace_fixture.rs`).
- Before shipping more than ~256 neurons, the spike-event ring capacity (now
  derived from the shipped topology, `LIVE_SPIKE_EVENT_WORST_CASE`) and
  main-thread ingestion need their own budget; quality cannot reduce either.
- RM-2355 shipped 48 neurons and did not try 64. The plan's rule stands: go
  to 64 / 8 only if R2 holds at every level and S7 shows no eviction; at 64
  the ring would be 16,384 and the pulse buffers 2.75 MB.
