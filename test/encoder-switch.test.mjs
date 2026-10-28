// The hero's axon-encoder switch (#95): the runtime restarts the WASM session
// with the same seed and the chosen mode, and the view mirrors the choice.
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTsModule, readSource } from './load-ts-module.mjs';

const runtime = await loadTsModule('../src/runtime/demo-runtime.ts');
const wasmSession = await loadTsModule('../src/runtime/wasm-session.ts');

const capable = { prefersReducedMotion: false, webgl: true, wasm: true, worker: true };

function seams({ wasmFail = false } = {}) {
  const inits = [];
  const wasmEvents = [];
  const rendererEvents = [];
  let sessionId = 0;
  let gate = null;
  let open = null;
  return {
    inits,
    wasmEvents,
    rendererEvents,
    // Hold every WASM init until release(), so a test can act mid-switch.
    hold() {
      gate = new Promise((resolve) => {
        open = resolve;
      });
    },
    release() {
      open?.();
      gate = null;
    },
    seams: {
      renderer: {
        async create() {
          rendererEvents.push('create');
          return {
            dispose: () => rendererEvents.push('dispose'),
            pause: () => rendererEvents.push('pause'),
            resume: () => rendererEvents.push('resume'),
            freeze: () => rendererEvents.push('freeze'),
            setCameraMotionEnabled: () => {},
          };
        },
        disposePartial() {},
      },
      wasm: {
        async init(options) {
          inits.push({ useWorker: options.useWorker, encoderMode: options.encoderMode });
          if (gate) await gate;
          if (wasmFail) {
            throw Object.assign(new Error('wasm failed'), { code: 'wasm-init-failed' });
          }
          const id = ++sessionId;
          return {
            dispose: () => wasmEvents.push(`dispose:${id}`),
            pause: () => wasmEvents.push(`pause:${id}`),
            resume: () => wasmEvents.push(`resume:${id}`),
          };
        },
      },
    },
  };
}

test('the default mode is temporal and a choice made before start is used by the first session', async () => {
  const fixture = seams();
  const demo = runtime.createDemoRuntime({ capabilities: capable, seams: fixture.seams, inViewport: true });
  assert.equal(demo.getSnapshot().encoderMode, 'temporal');
  assert.equal(demo.getEncoderMode(), 'temporal');
  await demo.setEncoderMode('rate');
  assert.equal(demo.getSnapshot().encoderMode, 'rate');
  assert.deepEqual(fixture.inits, [], 'no session is started by the choice alone');
  await demo.startIfAllowed();
  assert.deepEqual(fixture.inits, [{ useWorker: true, encoderMode: 'rate' }]);
  assert.equal(demo.getSnapshot().mode, 'live');
  demo.dispose();
});

test('switching while live disposes the session and starts one with the new mode, resumed at once', async () => {
  const fixture = seams();
  const demo = runtime.createDemoRuntime({ capabilities: capable, seams: fixture.seams, inViewport: true });
  await demo.startIfAllowed();
  assert.equal(demo.getSnapshot().mode, 'live');
  assert.deepEqual(fixture.wasmEvents, ['resume:1']);

  const pending = demo.setEncoderMode('delta');
  assert.equal(demo.getSnapshot().mode, 'initializing', 'the view shows the restart');
  assert.equal(demo.getSnapshot().encoderSwitchEnabled, false);
  assert.equal(demo.getSnapshot().playEnabled, false);
  await pending;

  assert.deepEqual(fixture.inits, [
    { useWorker: true, encoderMode: 'temporal' },
    { useWorker: true, encoderMode: 'delta' },
  ]);
  assert.deepEqual(fixture.wasmEvents, ['resume:1', 'dispose:1', 'resume:2']);
  assert.deepEqual(fixture.rendererEvents.filter((event) => event === 'dispose'), [], 'the renderer keeps its geometry');
  const snapshot = demo.getSnapshot();
  assert.equal(snapshot.mode, 'live');
  assert.equal(snapshot.encoderMode, 'delta');
  assert.equal(snapshot.encoderSwitchEnabled, true);
  demo.dispose();
});

test('a paused view gets an idle session that Play resumes; same or unknown modes are ignored', async () => {
  const fixture = seams();
  const demo = runtime.createDemoRuntime({ capabilities: capable, seams: fixture.seams, inViewport: true });
  await demo.startIfAllowed();
  await demo.play(); // pause
  assert.deepEqual(fixture.wasmEvents, ['resume:1', 'pause:1']);
  await demo.setEncoderMode('rate');
  assert.deepEqual(fixture.wasmEvents, ['resume:1', 'pause:1', 'dispose:1'], 'the new session waits for Play');
  await demo.play();
  assert.deepEqual(fixture.wasmEvents, ['resume:1', 'pause:1', 'dispose:1', 'resume:2']);

  await demo.setEncoderMode('rate');
  await demo.setEncoderMode('population');
  assert.equal(fixture.inits.length, 2, 'no restart for the same or an unknown mode');
  assert.equal(demo.getSnapshot().encoderMode, 'rate');
  demo.dispose();
});

test('a choice made while the first initialization is in flight is applied once it completes', async () => {
  const fixture = seams();
  const demo = runtime.createDemoRuntime({ capabilities: capable, seams: fixture.seams, inViewport: true });
  fixture.hold();
  const starting = demo.startIfAllowed();
  assert.equal(demo.getSnapshot().mode, 'initializing');
  const choice = demo.setEncoderMode('rate');
  assert.equal(demo.getSnapshot().encoderMode, 'rate');
  fixture.release();
  await Promise.all([starting, choice]);
  assert.deepEqual(
    fixture.inits.map((init) => init.encoderMode),
    ['temporal', 'rate'],
    'the first session ran the mode it was started with and was then replaced',
  );
  assert.deepEqual(fixture.wasmEvents, ['resume:1', 'dispose:1', 'resume:2']);
  assert.equal(demo.getSnapshot().mode, 'live');
  assert.equal(demo.getSnapshot().encoderMode, 'rate');
  demo.dispose();
});

test('leaving the viewport during a switch pauses the renderer instead of failing closed; returning resumes both', async () => {
  const fixture = seams();
  const demo = runtime.createDemoRuntime({ capabilities: capable, seams: fixture.seams, inViewport: true });
  await demo.startIfAllowed();
  const marker = fixture.rendererEvents.length;
  fixture.hold();
  const pending = demo.setEncoderMode('rate');
  await demo.setInViewport(false);
  assert.equal(demo.getSnapshot().mode, 'initializing', 'the switch is still in flight');
  assert.deepEqual(fixture.rendererEvents.slice(marker), ['pause']);
  await demo.setInViewport(true);
  fixture.release();
  await pending;
  assert.equal(demo.getSnapshot().mode, 'live');
  assert.equal(demo.getSnapshot().reason, 'ok');
  assert.deepEqual(fixture.wasmEvents, ['resume:1', 'dispose:1', 'resume:2']);
  assert.deepEqual(fixture.rendererEvents.slice(marker), ['pause', 'resume']);
  demo.dispose();
});

test('a view hidden through a switch leaves the replacement idle until it is shown again', async () => {
  const fixture = seams();
  const demo = runtime.createDemoRuntime({ capabilities: capable, seams: fixture.seams, inViewport: true });
  await demo.startIfAllowed();
  fixture.hold();
  const pending = demo.setEncoderMode('delta');
  await demo.setDocumentHidden(true);
  fixture.release();
  await pending;
  assert.notEqual(demo.getSnapshot().mode, 'fallback');
  assert.deepEqual(fixture.wasmEvents, ['resume:1', 'dispose:1'], 'nothing runs while the document is hidden');
  await demo.setDocumentHidden(false);
  assert.equal(demo.getSnapshot().mode, 'live');
  assert.deepEqual(fixture.wasmEvents, ['resume:1', 'dispose:1', 'resume:2']);
  demo.dispose();
});

test('pausing during a switch keeps the replacement idle for Play', async () => {
  const fixture = seams();
  const demo = runtime.createDemoRuntime({ capabilities: capable, seams: fixture.seams, inViewport: true });
  await demo.startIfAllowed();
  fixture.hold();
  const pending = demo.setEncoderMode('rate');
  await demo.play();
  assert.equal(demo.getSnapshot().mode, 'initializing');
  fixture.release();
  await pending;
  assert.equal(demo.getSnapshot().mode, 'awaiting-play');
  assert.deepEqual(fixture.wasmEvents, ['resume:1', 'dispose:1'], 'the new session waits for Play');
  await demo.play();
  assert.equal(demo.getSnapshot().mode, 'live');
  assert.deepEqual(fixture.wasmEvents, ['resume:1', 'dispose:1', 'resume:2']);
  demo.dispose();
});

test('quick changes coalesce to the latest mode', async () => {
  const fixture = seams();
  const demo = runtime.createDemoRuntime({ capabilities: capable, seams: fixture.seams, inViewport: true });
  await demo.startIfAllowed();
  const first = demo.setEncoderMode('delta');
  const second = demo.setEncoderMode('rate');
  await Promise.all([first, second]);
  assert.equal(fixture.inits.at(-1).encoderMode, 'rate');
  assert.equal(demo.getSnapshot().encoderMode, 'rate');
  assert.equal(demo.getSnapshot().mode, 'live');
  assert.equal(fixture.wasmEvents.filter((event) => event.startsWith('resume:')).length, fixture.inits.length, 'every live session was resumed once');
  demo.dispose();
});

test('a failing restart falls back closed, and a fallback runtime ignores later choices', async () => {
  const fixture = seams();
  const demo = runtime.createDemoRuntime({ capabilities: capable, seams: fixture.seams, inViewport: true });
  await demo.startIfAllowed();
  fixture.seams.wasm.init = async () => {
    throw Object.assign(new Error('wasm failed'), { code: 'wasm-init-failed' });
  };
  await demo.setEncoderMode('rate');
  assert.equal(demo.getSnapshot().mode, 'fallback');
  assert.equal(demo.getSnapshot().reason, 'wasm-init-failed');
  assert.equal(demo.getSnapshot().encoderSwitchEnabled, false);
  await demo.setEncoderMode('delta');
  assert.equal(demo.getSnapshot().mode, 'fallback');
  demo.dispose();
});

test('the view mirrors the mode on the island and its radios', () => {
  const inputs = [
    { value: 'delta', checked: false },
    { value: 'temporal', checked: true },
    { value: 'rate', checked: false },
  ];
  const elements = {
    root: { dataset: {} },
    status: { textContent: '' },
    play: { hidden: false, disabled: false, textContent: '' },
    encoder: { fieldset: { disabled: true }, inputs },
  };
  const demo = runtime.createDemoRuntime({ capabilities: capable, seams: seams().seams, inViewport: true });
  void demo.setEncoderMode('rate');
  runtime.applyDemoView(demo.getSnapshot(), elements);
  assert.equal(elements.root.dataset.encoderMode, 'rate');
  assert.deepEqual(inputs.map((input) => input.checked), [false, false, true]);
  assert.equal(elements.encoder.fieldset.disabled, false, 'a static, capable runtime can take a choice');
  demo.dispose();
});

test('each session records its own [contract, mode] config and the worker is told the mode', () => {
  assert.deepEqual(wasmSession.liveAdapterConfig(), [8, 1]);
  assert.deepEqual(wasmSession.liveAdapterConfig('delta'), [8, 0]);
  assert.deepEqual(wasmSession.liveAdapterConfig('rate'), [8, 2]);
  assert.deepEqual(wasmSession.liveAdapterOptions('rate'), { contractVersion: 8, encoderMode: 'rate' });
  const source = readSource('../src/runtime/wasm-session.ts');
  assert.match(source, /const adapterOptions = liveAdapterOptions\(initOptions\.encoderMode\);/);
  assert.match(source, /options: adapterOptions,/);
  assert.match(source, /createTelemetryRecorder\(DEMO_SEED, config\)/);
  assert.doesNotMatch(source, /LIVE_ADAPTER_CONFIG/);
});
