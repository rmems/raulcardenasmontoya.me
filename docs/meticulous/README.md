# Meticulous visual regression (draft setup)

Nothing here is active yet. Meticulous replays recorded sessions against each
PR build, so it needs a project, a GitHub App install, a repo secret, and some
recorded sessions before it can report anything.

1. Sign in at https://app.meticulous.ai and create an organization and a
   project for `rmems/raulcardenasmontoya.me` (the Meticulous MCP has no
   create-project tool, so this is a dashboard step).
2. Install the Meticulous GitHub App on this repo:
   https://github.com/apps/alwaysmeticulous/installations/new
3. Copy the project's API token and add it as the repository secret
   `METICULOUS_API_TOKEN` (Settings → Secrets and variables → Actions).
4. Record sessions. Either add the recorder snippet from the project's
   dashboard as the first script in `src/layouts/BaseLayout.astro` (it then
   records real visitors, so consider gating it on a preview build), or record
   a handful of flows yourself from the dashboard's recording instructions.
   Cover: home (live mesh + telemetry panel), /labs/nir/, /labs/plasticity/
   (Run, Reward, Scripted replay), /protocol/, /about/, /manifesto/, /work/.
5. Move `docs/meticulous/meticulous.yml` to `.github/workflows/meticulous.yml`
   and merge it to `main` so a base run exists; PRs then get diffs.
