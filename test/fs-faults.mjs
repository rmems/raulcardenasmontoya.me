import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

/** An `fs` error with the given code, as the OS would raise it. */
export function fsError(code, syscall, path) {
  const error = new Error(`${code}: simulated failure, ${syscall} '${path}'`);
  error.code = code;
  error.syscall = syscall;
  error.path = path;
  return error;
}

/**
 * Runs `fn` with selected `node:fs` functions wrapped, so permission and file-type
 * failures are deterministic on every OS (and when running as root), unlike
 * `chmod`/`mkfifo`. Each fault is `(original) => replacement`; call `original`
 * for paths that should behave normally.
 */
export function withFsFaults(faults, fn) {
  const originals = {};
  for (const [name, wrap] of Object.entries(faults)) {
    originals[name] = fs[name];
    fs[name] = wrap(originals[name]);
  }
  syncBuiltinESMExports();
  try {
    return fn();
  } finally {
    Object.assign(fs, originals);
    syncBuiltinESMExports();
  }
}
