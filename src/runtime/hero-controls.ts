/**
 * "Take the controls" for the homepage hero (mockup/home-lab-direction r3).
 *
 * Off (default): the copy sits over the mesh and nothing changes. On: the copy
 * fades out and becomes inert, the control row (encoder mode, hint, Exit)
 * appears, and focus moves to a keyboard input pad over the network. The pad
 * drives the same pointer input the demo already reads from the surface
 * (`createPointerTelemetry`): arrow keys move an [x, y] point and Space or
 * Enter presses, dispatched as pointer events on the surface. Esc, Exit or the
 * toggle return to the default state and focus the toggle again.
 */

const STEP = 0.04;
const BIG_STEP = 0.12;
const PAD_POINTER_ID = 0x7a11;
const RUNNING_MODES = new Set(['live', 'awaiting-play', 'initializing']);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function bindHeroControls(root: HTMLElement): (() => void) | null {
  const toggle = root.querySelector<HTMLButtonElement>('[data-controls-toggle]');
  const row = root.querySelector<HTMLElement>('[data-controls-row]');
  const exit = root.querySelector<HTMLButtonElement>('[data-controls-exit]');
  const pad = root.querySelector<HTMLElement>('[data-controls-pad]');
  const surface = root.querySelector<HTMLElement>('[data-demo-surface]');
  if (!toggle || !row || !exit || !pad || !surface) return null;
  const cursor = pad.querySelector<HTMLElement>('.hero-controls-cursor');
  const copy = [...root.querySelectorAll<HTMLElement>('.hero-live > .hero-heading, .hero-live > .hero-text')];

  let on = false;
  let x = 0.5;
  let y = 0.5;
  let pressed = false;

  const dispatch = (type: string, pressure: number) => {
    const box = surface.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return;
    surface.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        isPrimary: true,
        pointerId: PAD_POINTER_ID,
        pointerType: 'pen',
        clientX: box.left + x * box.width,
        clientY: box.top + y * box.height,
        pressure,
      }),
    );
  };

  const placeCursor = () => {
    if (!cursor) return;
    const box = surface.getBoundingClientRect();
    const padBox = pad.getBoundingClientRect();
    cursor.style.left = `${box.left - padBox.left + x * box.width}px`;
    cursor.style.top = `${box.top - padBox.top + y * box.height}px`;
  };

  const release = () => {
    if (pressed) dispatch('pointerup', 0);
    pressed = false;
    dispatch('pointerleave', 0);
    // Never hand focus to a hidden control: when the row tears down for a
    // settled failure (frozen, fallback), focus falls back to the document
    // instead of landing on an invisible toggle.
    if (!toggle.hidden) toggle.focus({ preventScroll: true });
  };

  const set = (next: boolean) => {
    if (next === on) return;
    on = next;
    root.dataset.controls = on ? 'on' : 'off';
    toggle.setAttribute('aria-pressed', String(on));
    for (const element of copy) element.inert = on;
    row.hidden = !on;
    pad.hidden = !on;
    pad.tabIndex = on ? 0 : -1;
    if (on) {
      placeCursor();
      pad.focus({ preventScroll: true });
      // Keep the row (and Exit) on screen, e.g. on phones where the stage is
      // tall: line the strip's bottom up with the viewport's, mesh above it.
      const figure = row.closest('figure') ?? row;
      if (figure.getBoundingClientRect().bottom > innerHeight) figure.scrollIntoView({ block: 'end' });
      return;
    }
    release();
  };

  // The toggle only makes sense while the live mesh can run.
  const syncAvailability = () => {
    // 'initializing' is transient: an encoder switch restarts the WASM
    // session through it, and closing the row mid-restart strands keyboard
    // focus on the hidden toggle. Only settled non-running modes (frozen,
    // fallback) tear the controls down.
    const available = RUNNING_MODES.has(root.dataset.mode ?? '');
    toggle.hidden = !available;
    if (!available && on) set(false);
  };

  const onToggle = () => {
    set(!on);
  };
  const onExit = () => {
    set(false);
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (on && event.key === 'Escape') {
      event.preventDefault();
      set(false);
    }
  };
  const onPadKeydown = (event: KeyboardEvent) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const moves: Record<string, [number, number] | undefined> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      x = clamp01(x + move[0]);
      y = clamp01(y + move[1]);
      placeCursor();
      dispatch('pointermove', pressed ? 0.5 : 0);
    } else if (event.key === ' ' || event.key === 'Enter') {
      // Cancel every handled keydown, not just the first: repeated keydowns
      // have their own default actions, and an uncancelled one scrolls the
      // page while the visitor holds the press.
      event.preventDefault();
      if (event.repeat) return;
      pressed = true;
      pad.dataset.pressed = 'true';
      dispatch('pointerdown', 0.5);
    }
  };
  const onPadKeyup = (event: KeyboardEvent) => {
    if ((event.key === ' ' || event.key === 'Enter') && pressed) {
      event.preventDefault();
      pressed = false;
      delete pad.dataset.pressed;
      dispatch('pointerup', 0);
    }
  };
  const onPadBlur = () => {
    if (pressed) dispatch('pointerup', 0);
    pressed = false;
    delete pad.dataset.pressed;
  };

  const observer = new MutationObserver(syncAvailability);
  observer.observe(root, { attributes: true, attributeFilter: ['data-mode'] });
  syncAvailability();
  root.dataset.controls = 'off';
  toggle.addEventListener('click', onToggle);
  exit.addEventListener('click', onExit);
  document.addEventListener('keydown', onKeydown);
  pad.addEventListener('keydown', onPadKeydown);
  pad.addEventListener('keyup', onPadKeyup);
  pad.addEventListener('blur', onPadBlur);
  window.addEventListener('resize', placeCursor);

  return () => {
    observer.disconnect();
    toggle.removeEventListener('click', onToggle);
    exit.removeEventListener('click', onExit);
    document.removeEventListener('keydown', onKeydown);
    pad.removeEventListener('keydown', onPadKeydown);
    pad.removeEventListener('keyup', onPadKeyup);
    pad.removeEventListener('blur', onPadBlur);
    window.removeEventListener('resize', placeCursor);
  };
}
