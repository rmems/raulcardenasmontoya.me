import { ENCODER_MODE_NAMES, type EncoderModeName } from './neuromorphic-adapter';
import {
  applyDemoView,
  createDemoRuntime,
  detectCapabilities,
  getDemoSeams,
  type DemoRuntime,
  type DemoViewElements,
} from './demo-runtime';
import { provideLiveDemoSeams } from './live-seams';
import { bindDemoTelemetryPanel } from './telemetry-entry';

interface BoundIsland {
  dispose: () => void;
}

function requiredElement<T extends Element>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Neuromorphic demo island is missing ${selector}`);
  }

  return element;
}

function viewElements(root: HTMLElement): DemoViewElements {
  const fieldset = typeof root.querySelector === 'function' ? root.querySelector<HTMLFieldSetElement>('[data-demo-encoder]') : null;
  return {
    root: { dataset: root.dataset as Record<string, string> },
    status: requiredElement<HTMLElement>(root, '[data-demo-status]'),
    play: requiredElement<HTMLButtonElement>(root, '[data-demo-play]'),
    surface: requiredElement<HTMLElement>(root, '[data-demo-surface]'),
    origin: requiredElement<HTMLElement>(root, '[data-demo-origin]'),
    encoder: fieldset
      ? { fieldset, inputs: fieldset.querySelectorAll<HTMLInputElement>('input[name="encoder-mode"]') }
      : undefined,
    readout: {
      encoder: root.querySelector<HTMLElement>('[data-readout-encoder]'),
      step: root.querySelector<HTMLElement>('[data-readout-step]'),
      window: root.querySelector<HTMLElement>('[data-readout-window]'),
      total: root.querySelector<HTMLElement>('[data-readout-total]'),
      restart: root.querySelector<HTMLElement>('[data-readout-restart]'),
      raster: root.querySelector<HTMLElement>('[data-readout-raster]'),
    },
  };
}

function isEncoderModeName(value: string): value is EncoderModeName {
  return (ENCODER_MODE_NAMES as readonly string[]).includes(value);
}

type EncoderRestartState = 'queued' | 'restarted' | 'failed' | 'waiting';

function restartMessage(state: EncoderRestartState): string {
  switch (state) {
    case 'queued':
      return 'restart queued';
    case 'restarted':
      return 'restarted';
    case 'failed':
      return 'restart failed';
    case 'waiting':
      return 'waiting to start';
  }
}

function clearHeroReadout(root: HTMLElement): void {
  for (const selector of ['[data-readout-step]', '[data-readout-window]', '[data-readout-total]']) {
    const value = root.querySelector<HTMLElement>(selector);
    if (value) value.textContent = '0';
  }
  for (const cell of root.querySelectorAll<HTMLElement>('[data-raster-cell]')) {
    cell.setAttribute('data-spike-level', '0');
  }
  root.querySelector<HTMLElement>('[data-readout-raster]')?.setAttribute(
    'aria-label',
    'Recent network spike activity: 0 ticks, 0 spikes',
  );
}

function resetHeroReadout(root: HTMLElement, encoderName: EncoderModeName, state: EncoderRestartState): void {
  const encoder = root.querySelector<HTMLElement>('[data-readout-encoder]');
  const restart = root.querySelector<HTMLElement>('[data-readout-restart]');
  if (encoder) encoder.textContent = encoderName;
  clearHeroReadout(root);
  if (restart) {
    restart.textContent = restartMessage(state);
  }
  root.dataset.encoderRestart = state;
}

/** Elements whose visibility gates the island (`[data-demo-viewport]`), else the root. */
export function viewportTargets(root: HTMLElement): Element[] {
  const marked =
    typeof root.querySelectorAll === 'function' ? Array.from(root.querySelectorAll('[data-demo-viewport]')) : [];
  return marked.length > 0 ? marked : [root];
}

function motionQueryList(host: Window): MediaQueryList | undefined {
  if (typeof host.matchMedia !== 'function') {
    return undefined;
  }

  return host.matchMedia('(prefers-reduced-motion: reduce)');
}

export function bindDemoIsland(root: HTMLElement, runtime?: DemoRuntime): BoundIsland {
  const boundRuntime =
    runtime ??
    createDemoRuntime({
      capabilities: detectCapabilities(window),
      seams: getDemoSeams(root),
      inViewport: false,
      documentHidden: document.hidden,
    });
  const elements = viewElements(root);
  const play = requiredElement<HTMLButtonElement>(root, '[data-demo-play]');
  // Optional and closed by default: its code loads on first open, and it
  // samples only while open.
  const telemetry = bindDemoTelemetryPanel(root);
  const motionQuery = motionQueryList(window);
  let disposed = false;

  const paint = () => {
    if (!disposed) {
      applyDemoView(boundRuntime.getSnapshot(), elements);
    }
  };
  const unsubscribeSnapshot = boundRuntime.onSnapshotChange(paint);

  const onPlay = () => {
    const pending = boundRuntime.play();
    paint();
    void pending.then(paint);
  };

  // The encoder radios: a change restarts the WASM session with the same seed
  // and the chosen `axon-encoder` mode; the runtime coalesces quick changes.
  const encoder = elements.encoder?.fieldset as HTMLFieldSetElement | undefined;
  let encoderChangeController: AbortController | null = null;
  const onEncoderChange = (event: Event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.name === 'encoder-mode' && isEncoderModeName(target.value)) {
      encoderChangeController?.abort();
      const controller = new AbortController();
      encoderChangeController = controller;
      resetHeroReadout(root, target.value, 'queued');
      const pending = boundRuntime.setEncoderMode(target.value);
      paint();
      void pending.then(() => {
        if (controller.signal.aborted) return;
        const snapshot = boundRuntime.getSnapshot();
        const failed = snapshot.mode === 'fallback' || snapshot.mode === 'frozen';
        const state = failed
          ? 'failed'
          : root.dataset.demoHasRun === 'true'
            ? 'restarted'
            : 'waiting';
        resetHeroReadout(root, snapshot.encoderMode, state);
        paint();
      }).catch(() => {
        if (controller.signal.aborted) return;
        resetHeroReadout(root, boundRuntime.getSnapshot().encoderMode, 'failed');
        paint();
      });
    }
  };

  const onVisibility = () => {
    void boundRuntime.setDocumentHidden(document.hidden).then(paint);
  };

  const onContextLost = () => {
    boundRuntime.reportContextLost();
    paint();
  };
  const contextLostCapture = { capture: true } as const;

  const onPageHide = (event: Event) => {
    if ('persisted' in event && event.persisted) {
      void boundRuntime.setDocumentHidden(true).then(paint);
      return;
    }

    dispose();
  };

  const onPageShow = () => {
    if (disposed) {
      return;
    }

    void boundRuntime.setDocumentHidden(document.hidden).then(paint);
  };

  const onMotionChange = (event: MediaQueryListEvent) => {
    boundRuntime.setPrefersReducedMotion(event.matches);
    paint();
  };

  const dispose = () => {
    if (disposed) {
      return;
    }

    disposed = true;
    encoderChangeController?.abort();
    unsubscribeSnapshot();
    play.removeEventListener('click', onPlay);
    encoder?.removeEventListener('change', onEncoderChange);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('astro:before-swap', dispose);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    motionQuery?.removeEventListener('change', onMotionChange);
    root.removeEventListener('webglcontextlost', onContextLost, contextLostCapture);
    for (const target of targets) {
      target.removeEventListener?.('toggle', evaluateViewport);
    }
    observer?.disconnect();
    telemetry?.dispose();
    boundRuntime.dispose();
  };

  play.addEventListener('click', onPlay);
  encoder?.addEventListener('change', onEncoderChange);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('astro:before-swap', dispose);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  motionQuery?.addEventListener('change', onMotionChange);
  root.addEventListener('webglcontextlost', onContextLost, contextLostCapture);

  // The island runs while any of its viewport targets is on screen. In the
  // homepage hero those are the mesh and the telemetry panel, so hero copy
  // alone in view (the mesh still below the fold on a phone) starts nothing,
  // and reading the open panel keeps it fed. Islands without targets use the
  // whole root.
  const targets = viewportTargets(root);
  const intersecting = new Set<Element>();
  // A closed <details> still lays out its <summary>, which would count as on
  // screen, so a collapsed telemetry panel must not keep the island running or
  // start it before the mesh has been seen. Opening it counts again.
  const countsAsVisible = (target: Element): boolean =>
    !(target.tagName === 'DETAILS' && !(target as HTMLDetailsElement).open);
  const evaluateViewport = (): void => {
    const visible = [...intersecting].some(countsAsVisible);
    void boundRuntime.setInViewport(visible).then(paint);
  };
  const observer =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                intersecting.add(entry.target);
              } else {
                intersecting.delete(entry.target);
              }
            }
            evaluateViewport();
          },
          { threshold: 0.2 },
        )
      : null;

  if (observer) {
    for (const target of targets) {
      observer.observe(target);
      // Opening or closing a panel fires no new intersection entry.
      if (target.tagName === 'DETAILS' && typeof target.addEventListener === 'function') {
        target.addEventListener('toggle', evaluateViewport);
      }
    }
  } else {
    void boundRuntime.setInViewport(true).then(paint);
  }

  void boundRuntime.startIfAllowed().then(paint);
  paint();

  return { dispose };
}

export function enhanceNeuromorphicDemos(scope: ParentNode = document): BoundIsland[] {
  provideLiveDemoSeams();
  const islands: BoundIsland[] = [];

  for (const root of scope.querySelectorAll<HTMLElement>('[data-neuromorphic-demo]')) {
    try {
      islands.push(bindDemoIsland(root));
    } catch {
      // Capability or binding failures must not interrupt the surrounding page.
    }
  }

  return islands;
}
