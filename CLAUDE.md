@AGENTS.md

# CLAUDE.md

Claude-specific notes only. Layout, toolchain pins, the full command list, and commit conventions are in
`AGENTS.md` (imported above); do not duplicate them here.

## Commands

Run from the repo root. "Verified" means it ran successfully in a fresh checkout here (Linux, CPU only, Node 22.22.0,
Rust toolchains 1.97.1, 1.98.1 and 1.99.0 installed, no Chrome). Disk was nearly full, so `npm ci` could not finish.

| Command | Status |
|---|---|
| `cargo +1.98.1 fmt --manifest-path crates/neuromorphic-adapter/Cargo.toml --check` | verified |
| `node scripts/verify-browser-dependencies.mjs` | verified |
| `npm ci --ignore-scripts` | not run (failed with ENOSPC on the full disk; CI uses it) |
| `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` | not run (need `node_modules`, see above) |
| `npm run validate:rust` | not run (the `wasm32-unknown-unknown` target is not installed for 1.98.1, and the crate build was skipped for disk space) |
| `npm run test:wasm-adapter`, `test:wasm-web-pkg`, `test:wasm-browser`, `test:layout`, `npm run validate` | not run (need `wasm-bindgen-cli` 0.2.126, Chrome via `BROWSER_BIN`, and `dist/`) |
| `npm run coverage` / `test:coverage:rust` | not run (needs `cargo-llvm-cov`; CI uploads to Codecov and Qlty with secrets or OIDC) |
| `npm run dev`, `npm run preview`, `npm run perf:*` | not run (long-running servers and benchmarks) |

CI workflows: `.github/workflows/quality.yml` (`validate` and `coverage report and uploads`, run in parallel), `.github/workflows/deploy.yml` (GitHub Pages deploy from `main`) and `.github/workflows/claude.yml` (`@claude` mentions via the Claude GitHub App; it never builds the site). The upload
steps need `CODECOV_TOKEN`, `QLTY_COVERAGE_TOKEN` or OIDC and are not local gates. Run `npm run validate` before pushing.

## Architecture map

- `src/pages/`, `src/components/`, `src/layouts/`, `src/styles/`: Astro site. `src/data/{site,projects,labs}.ts` hold site identity, project cards and lab entries.
- `src/content/notes/` (schema in `src/content.config.ts`) and `src/content/native-evidence/`: Markdown notes and recorded CUDA/FPGA evidence JSON.
- `src/runtime/`, `src/native-evidence/`, `src/protocol/`: browser runtime for the WASM demos, evidence parser and catalog, and `/protocol/` viewer.
- `crates/neuromorphic-adapter/`: Rust crate built for `wasm32-unknown-unknown`, with its own `Cargo.lock` and `rust-toolchain.toml`.
- `public/wasm/neuromorphic-adapter/` and `public/wasm/neuromorphic-adapter-labs/`: committed, generated browser packages. Regenerate with `npm run build:wasm-web`.
- `scripts/verify-*.mjs`, `scripts/perf/`: verification and measurement scripts. `test/*.test.mjs` is the `node --test` suite (`test/fixtures/`).
- `docs/architecture/` is the design reference. `CONTENT.md` is the publishing checklist. `docs/coverage-and-quality.md` covers coverage.

## Invariants and non-goals

- The site deploys to GitHub Pages; `raulcardenasmontoya.me` is canonical. Never touch `hooks.shipoftheseus.dev`.
- Do not invent benchmark numbers; leave the native-evidence catalog empty without a measured capture (`AGENTS.md`, `CONTENT.md`).
- Do not hand-edit `public/wasm/**`; `test:wasm-web-pkg` fails on drift from the locked toolchain.
- The browser dependency policy in `scripts/verify-browser-dependencies.mjs` is enforced by `validate:rust`; do not loosen it to pass.
- `src/data/site.ts` carries no `null` placeholders (a contract test enforces it): the public email is `montoyaraul34@gmail.com` and the résumé is `public/resume.pdf` (`resumePath: '/resume.pdf'`). Keep the résumé single column with a real text layer; check it with `pdftotext public/resume.pdf -`.
- `site.title` is `AI Engineer`; page titles and descriptions lead with the full name, and `BaseLayout.astro` emits Person JSON-LD whose `sameAs` is every value in `site.social`. Add new profiles to `social` only.
- Source files here have no SPDX headers (no `.astro`, `.ts`, `.mjs` or `.rs` file carries one); do not add them.

## Gotchas

- `package.json` is `private` and has no `files` list, and the crate is not published, so adding `CLAUDE.md` needs no manifest change. Never run publish or deploy commands.
- `.gitignore` lists `/.agents/`, yet `.agents/setup` and `.cursor/environment.json` are tracked. `.claude/` is not gitignored, so do not commit local agent state there.
- CI installs with `npm ci --ignore-scripts`; `.npmrc` turns off audit, fund and update notices.
- `npm run validate` needs the pinned Rust toolchain (see AGENTS.md) with the wasm target plus a Chrome binary, so it is heavy on a small machine.
- Edit only what the task needs.
