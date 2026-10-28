import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('portfolio content model exposes the three named projects and clear publishing placeholders', () => {
  assert.equal(existsSync(new URL('../src/data/projects.ts', import.meta.url)), true);
  assert.equal(existsSync(new URL('../CONTENT.md', import.meta.url)), true);

  const projects = read('src/data/projects.ts');
  const handoff = read('CONTENT.md');

  assert.match(projects, /Ship of Theseus Workstation/);
  assert.match(projects, /Synthetic Factory/);
  assert.match(projects, /Grok-1\/SAAQ research/);
  assert.match(handoff, /GitHub/);
  assert.match(handoff, /LinkedIn/);
  assert.match(handoff, /résumé/i);
});

test('every requested primary route is backed by an Astro page', () => {
  for (const route of [
    'src/pages/index.astro',
    'src/pages/work.astro',
    'src/pages/about.astro',
    'src/pages/manifesto.astro',
    'src/pages/notes/index.astro',
    'src/pages/contact.astro',
    'src/pages/resume.astro',
    'src/pages/evidence.astro',
    'src/pages/labs/index.astro',
    'src/pages/labs/nir.astro',
    'src/pages/labs/plasticity.astro',
  ]) {
    assert.equal(existsSync(new URL(`../${route}`, import.meta.url)), true, `${route} is missing`);
  }
});

test('the responsive stylesheet does not force horizontal scrolling on narrow screens', () => {
  const styles = read('src/styles/global.css');
  const packageJson = JSON.parse(read('package.json'));
  const layoutCheck = read('scripts/verify-layout.mjs');

  assert.doesNotMatch(styles, /min-width:320px/);
  assert.match(styles, /@media\s*\(max-width:\s*360px\)/);
  // Long words wrap, and the largest headings are capped by the viewport,
  // not by rem, so 200% text cannot widen the page.
  assert.match(styles, /body \{[^}]*overflow-wrap: break-word;/);
  assert.match(styles, /\.primary-nav \{ flex-wrap: wrap;/);
  assert.match(styles, /font-size: min\(17vw, 5rem\)/);
  // Fraction tracks may shrink below their content (`minmax(0, …fr)`, or a
  // minimum no wider than the grid), so a wide fallback font wraps text
  // instead of widening the page. Only the desktop header keeps
  // content-sized side tracks (its navigation wraps).
  const contentSizedTracks = [...styles.matchAll(/grid-template-columns:\s*([^;]+);/g)]
    .map((match) => match[1].trim())
    .filter((tracks) =>
      /(^|[\s(,])\d*\.?\d+fr/.test(
        tracks.replace(/minmax\(0, \d*\.?\d+fr\)/g, '').replace(/minmax\(min\(100%, \d*\.?\d+rem\), \d*\.?\d+fr\)/g, ''),
      ),
    );
  assert.deepEqual(contentSizedTracks, ['1fr auto 1fr']);
  assert.doesNotMatch(styles, /white-space: nowrap/, 'labels and links wrap when their box is narrow');
  // The live telemetry panel (homepage) shrinks and stacks with text size,
  // and the layout check measures the homepage with it open.
  const telemetryStyles = read('src/styles/telemetry.css');
  assert.match(telemetryStyles, /container: telemetry-block \/ inline-size;/);
  assert.match(telemetryStyles, /@container telemetry-block \(max-width: 15rem\)/);
  assert.match(telemetryStyles, /\.demo-telemetry-features li \{[^}]*grid-template-columns: 1\.4rem minmax\(0, 8\.5rem\) minmax\(2\.5rem, 1fr\) 3rem;/);
  assert.match(layoutCheck, /openTelemetryPanel/);
  // Project cards get fewer, wider columns as text grows instead of cramped ones.
  assert.match(styles, /\.project-grid \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 18rem\), 1fr\)\);/);
  // Every built page is loaded at 320 to 1024 px with 100% and 200% text in CI.
  assert.equal(packageJson.scripts['test:layout'], 'node --experimental-websocket scripts/verify-layout.mjs');
  assert.match(packageJson.scripts.validate, /npm run build && .* && npm run test:layout$/);
  assert.match(layoutCheck, /LAYOUT_WIDTHS = Object\.freeze\(\[320, 360, 375, 768, 1024\]\)/);
  assert.match(layoutCheck, /TEXT_SCALES = Object\.freeze\(\['100%', '200%'\]\)/);
});

test('every count on the site comes from a dated snapshot, never from the copy', () => {
  const counts = read('src/artifacts/counts.ts');
  assert.match(counts, /loadCrates\(\)/);
  assert.match(counts, /loadHfArtifacts\(\)/);
  assert.match(counts, /upstreamPrs\.length/);
  for (const page of ['src/pages/index.astro', 'src/pages/about.astro', 'src/pages/resume.astro', 'src/pages/work.astro']) {
    assert.match(read(page), /loadSiteCounts\(\)/, `${page} reads the shared counts`);
  }
  // No template, component, layout, data file or note types a count in digits.
  const typedCount = /\b\d+ (?:published |merged |public )?(?:Rust crates|Hugging Face datasets|research artifacts|datasets|crates|pull requests)\b/;
  for (const dir of ['src/pages', 'src/components', 'src/layouts', 'src/data', 'src/content']) {
    for (const file of readdirSync(new URL(`../${dir}`, import.meta.url), { recursive: true })) {
      if (!/\.(astro|ts|md)$/.test(String(file))) continue;
      assert.doesNotMatch(read(`${dir}/${file}`), typedCount, `${dir}/${file} types a count by hand`);
    }
  }
  // Project briefs take counts through tokens, in words too; unknown tokens stay as written.
  assert.doesNotMatch(
    read('src/data/projects.ts'),
    /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) (?:public )?(?:datasets|crates|research artifacts)\b/i,
  );
  assert.match(counts, /Object\.hasOwn\(counts, key\)/);
  const home = read('src/pages/index.astro');
  assert.match(home, /<ul class="hero-stats" aria-label="Proof points">/);
  assert.match(home, /counts\.cratesAsOf/);
  assert.match(home, /counts\.datasetsAsOf/);
  assert.match(home, /counts\.mergedPrsVerifiedAt/);
  assert.match(home, /href: '\/artifacts\/#upstream'/);
});

test('the static site does not depend on remotely hosted fonts', () => {
  assert.doesNotMatch(read('src/styles/global.css'), /@import\s+url/);
});

test('the fonts are self-hosted Latin subsets with their licences, preloaded where the headline uses them', () => {
  const styles = read('src/styles/global.css');
  const layout = read('src/layouts/BaseLayout.astro');
  for (const file of ['inter-latin.woff2', 'inter-italic-latin.woff2', 'newsreader-italic-latin.woff2', 'LICENSE-Inter.txt', 'LICENSE-Newsreader.txt']) {
    assert.equal(existsSync(new URL(`../public/fonts/${file}`, import.meta.url)), true, file);
  }
  assert.match(styles, /@font-face \{\s*font-family: Inter;\s*font-style: normal;\s*font-weight: 400 800;\s*font-display: swap;\s*src: url\('\/fonts\/inter-latin\.woff2'\)/);
  assert.match(styles, /@font-face \{\s*font-family: Inter;\s*font-style: italic;/);
  assert.match(styles, /@font-face \{\s*font-family: Newsreader;\s*font-style: italic;/);
  assert.match(styles, /--serif: Newsreader, 'Iowan Old Style'/);
  assert.match(layout, /<link rel="preload" href="\/fonts\/inter-latin\.woff2" as="font" type="font\/woff2" crossorigin \/>/);
  assert.match(layout, /preloadSerif \? <link rel="preload" href="\/fonts\/newsreader-italic-latin\.woff2"/);
  assert.match(read('src/pages/index.astro'), /<BaseLayout preloadSerif /);
  assert.match(read('src/pages/work.astro'), /<BaseLayout preloadSerif /);
  for (const file of readdirSync(new URL('../src', import.meta.url), { recursive: true })) {
    if (!/\.(astro|css|ts|mjs)$/.test(String(file))) continue;
    assert.doesNotMatch(read(`src/${file}`), /fonts\.googleapis\.com|fonts\.gstatic\.com/, `${file} references a remote font host`);
  }
});

test('small labels stay at or above 0.72rem, apart from the phone navigation', () => {
  for (const file of readdirSync(new URL('../src/styles', import.meta.url))) {
    const styles = read(`src/styles/${file}`);
    const small = [...styles.matchAll(/font-size: (0\.\d+)rem/g)]
      .filter((match) => Number(match[1]) < 0.72)
      .map((match) => match[0]);
    assert.deepEqual(small, file === 'global.css' ? ['font-size: 0.68rem'] : [], `${file}: ${small.join(', ')}`);
  }
  assert.match(read('src/styles/global.css'), /\.primary-nav a, \.header-profile \{ font-size: 0\.68rem; \}/);
  // Cards and chips read the cool tokens; no warm literal colours remain.
  assert.doesNotMatch(read('src/styles/global.css'), /#4f504a|241 240 233|229 227 217/);
  assert.match(read('src/styles/global.css'), /\.project-card \{[^}]*background: var\(--surface\);/);
});

test('inner pages with a compact intro use a smaller heading so content starts on the first screen', () => {
  const styles = read('src/styles/global.css');
  assert.match(styles, /\.page-intro\.compact h1 \{ font-size: clamp\(2\.6rem, 4\.6vw, 4\.6rem\);/);
  assert.match(styles, /\.page-intro\.compact h1 \{ font-size: min\(11vw, 3rem\); \}/);
  for (const page of ['labs/index', 'artifacts', 'evidence', 'protocol', 'notes/index', 'contact', 'labs/nir', 'labs/plasticity']) {
    assert.match(read(`src/pages/${page}.astro`), /class="page-intro compact"/, page);
  }
});

test('the site has a dark scheme through the tokens, and the hero drawing carries both edge sets', () => {
  const styles = read('src/styles/global.css');
  const hero = read('src/styles/hero.css');
  const island = read('src/components/NeuromorphicDemo.astro');
  const dark = styles.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\}/);
  assert.ok(dark, 'dark token block');
  for (const token of ['--ink', '--paper', '--surface', '--paper-deep', '--muted', '--line', '--line-strong', '--accent', '--accent-soft', '--secondary', '--spike', '--code-bg']) {
    assert.match(dark[1], new RegExp(`${token}:\\s*[^;]+;`), token);
  }
  assert.match(dark[1], /color-scheme: dark;/);
  assert.match(styles, /^code \{[^}]*background: var\(--code-bg\);/m);
  assert.match(read('src/layouts/BaseLayout.astro'), /name="theme-color" content="#0f1218" media="\(prefers-color-scheme: dark\)"/);
  assert.match(island, /staticMeshGeometry\(topology, SITE_TOPOLOGY_PALETTE_DARK\)/);
  assert.match(island, /class="hero-mesh-edges hero-mesh-edges-light"/);
  assert.match(island, /class="hero-mesh-edges hero-mesh-edges-dark"/);
  assert.match(hero, /\.hero-mesh-edges-dark \{ display: none; \}/);
  assert.match(hero, /@media \(prefers-color-scheme: dark\) \{\s*\.hero-mesh-edges-light \{ display: none; \}\s*\.hero-mesh-edges-dark \{ display: inline; \}/);
  assert.match(hero, /\.hero-mesh-nodes \{ fill: none; stroke: var\(--muted\);/);
  // Every lab canvas reads its colours from the tokens, so it follows the scheme.
  for (const file of ['src/runtime/telemetry-view.ts', 'src/runtime/enhance-plasticity.ts', 'src/runtime/topology-renderer.ts']) {
    assert.match(read(file), /getPropertyValue\(name\)/, file);
  }
});

test('the labs index previews each lab from its committed data, without JavaScript', () => {
  const page = read('src/pages/labs/index.astro');
  const data = read('src/data/labs.ts');
  assert.match(data, /preview: 'nir-diagram'/);
  assert.match(data, /preview: 'plasticity-network'/);
  assert.match(page, /NirDiagramPreview/);
  assert.match(page, /PlasticityNetworkPreview/);
  assert.doesNotMatch(page, /<script/);
  assert.match(read('src/components/NirDiagramPreview.astro'), /layoutNirDiagram\(projection\)/);
  assert.match(read('src/components/PlasticityNetworkPreview.astro'), /final_weight_bits/);
  assert.doesNotMatch(read('src/components/NirDiagramPreview.astro') + read('src/components/PlasticityNetworkPreview.astro'), /<script/);
});

test('publishing handoff values become live only when configured', () => {
  const contact = read('src/pages/contact.astro');
  const resume = read('src/pages/resume.astro');
  const site = read('src/data/site.ts');

  assert.match(contact, /site\.email/);
  assert.match(contact, /mailto:\$\{site\.email\}/);
  assert.match(resume, /site\.resumePath/);
  assert.match(resume, /href=\{site\.resumePath\}/);
  assert.match(site, /site\.resumePath \? \[\{ href: site\.resumePath, label: 'Résumé' \}\] : \[\]/);
});

test('the work page expands existing project data without unsupported outcomes or links', () => {
  const work = read('src/pages/work.astro');
  const projects = read('src/data/projects.ts');

  assert.match(work, /projects\.map/);
  assert.match(work, /Questions in view/);
  assert.match(work, /Working areas/);
  assert.match(work, /Evidence/);
  assert.match(work, /Next milestone/);
  assert.match(work, /Why it matters/);
  assert.match(projects, /questions: string\[\]/);
  assert.match(projects, /evidence\?: string/);
  assert.match(projects, /whyItMatters\?: string/);
  assert.match(work, /Each brief leads with its public evidence/);
  assert.doesNotMatch(projects, /https?:\/\/(?!github\.com\/(?:rmems|Limen-Neural)\/|huggingface\.co\/collections\/rmems\/)/);
  assert.match(work, /<p>\{fillCounts\(project\.evidence, counts\)\}<\/p>/);
  assert.match(work, /<p>\{fillCounts\(project\.next, counts\)\}<\/p>/);
  assert.match(read('src/components/ProjectCard.astro'), /fillCounts\(project\.evidence, counts\)/);

  // Evidence order: strongest public artifacts first, workstation then Grok-1 last.
  const order = [
    "'engram-parser'",
    "'Neuromorphic crate stack'",
    "'Synthetic Factory'",
    "'agoge-forger'",
    "'nir-rs'",
    "'Ship of Theseus Workstation'",
    "'Grok-1/SAAQ research'",
  ];
  let last = -1;
  for (const name of order) {
    const at = projects.indexOf(name);
    assert.ok(at > last, `${name} is in evidence order`);
    last = at;
  }

  // Every brief carries an evidence line, a next milestone and a why-it-matters line.
  // Headings carry the labels, so the strings themselves carry no "Evidence:" prefix.
  assert.doesNotMatch(projects, /(evidence|next|whyItMatters):\s*'(Evidence|Next milestone|Why it matters):/);
  const starts = order.map((name) => projects.indexOf(name));
  for (let i = 0; i < order.length; i++) {
    const block = projects.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : undefined);
    assert.match(block, /evidence:/, `${order[i]} has an evidence line`);
    assert.match(block, /next:/, `${order[i]} has a next milestone`);
    assert.match(block, /whyItMatters:/, `${order[i]} has a why-it-matters line`);
  }

  // Evidence numbers come from dated-snapshot tokens, never typed digits.
  // (The "Grok-1" name carries a digit; strip it before checking for counts.)
  for (const match of projects.matchAll(/evidence:\s*'([^']+)'/g)) {
    const line = match[1].replace(/Grok-1/g, 'Grok-one');
    assert.match(line, /\{\{\w+\}\}/, `evidence line is token-backed: ${line.slice(0, 60)}`);
    assert.doesNotMatch(line, /\b\d+\b/, `evidence line types no number by hand: ${line.slice(0, 60)}`);
  }
});

test('the Grok-1/SAAQ brief is a long-term programme with public links and no claimed result', () => {
  const projects = read('src/data/projects.ts');
  const brief = projects.slice(projects.indexOf("'Grok-1/SAAQ research'"));
  assert.match(brief, /'Active research, long-term'/);
  assert.match(brief, /there is no validated result yet/);
  assert.match(brief, /The formulation is still being searched for\./);
  for (const repo of ['corinth-canal', 'xai-dissect', 'magere-brug', 'combine-for-AI']) {
    assert.match(brief, new RegExp(`href: 'https://github\\.com/rmems/${repo}'`), repo);
  }
  assert.match(brief, /href: 'https:\/\/huggingface\.co\/collections\/rmems\/grok-1-dissection-and-ternary-packing-/);
  assert.match(brief, /featured: false/);
  // The Synthetic Factory evidence line names its share of the hero's dataset count, so the two read as one number set.
  assert.match(projects, /\{\{factoryDatasets\}\} datasets across \{\{factoryCollections\}\} Synthetic Factory collections, of \{\{datasets\}\} public datasets/);
});

test('public identity links use the verified profile destinations', () => {
  const identity = read('src/data/site.ts');

  assert.match(identity, /fullName: 'Raul Cardenas Montoya'/);
  assert.match(identity, /github: 'https:\/\/github\.com\/rmems'/);
  assert.match(identity, /linkedin: 'https:\/\/www\.linkedin\.com\/in\/raul-cardenas-montoya'/);
  assert.match(identity, /huggingface: 'https:\/\/huggingface\.co\/rmems'/);
  assert.match(identity, /instagram: 'https:\/\/www\.instagram\.com\/KeepOnSpiking'/);
  assert.match(identity, /threads: 'https:\/\/www\.threads\.com\/@KeepOnSpiking'/);
});

test('identity carries the AI Engineer title, every profile link, and Person JSON-LD', () => {
  const identity = read('src/data/site.ts');
  const layout = read('src/layouts/BaseLayout.astro');

  assert.match(identity, /title: 'AI Engineer'/);
  assert.match(identity, /x: 'https:\/\/x\.com\/KeepOnSpiking'/);
  assert.match(identity, /cratesio: 'https:\/\/crates\.io\/users\/rmems'/);
  assert.doesNotMatch(identity, /cursor:/);
  assert.match(layout, /'@type': 'Person'/);
  assert.match(layout, /sameAs: Object\.values\(site\.social\)/);
  assert.match(layout, /application\/ld\+json/);
  assert.match(layout, /`\$\{site\.fullName\} — \$\{site\.title\}`/);
});

test('site.ts has no null placeholders and the résumé PDF ships', () => {
  const site = read('src/data/site.ts');
  assert.deepEqual([...site.matchAll(/^\s*(\w+):\s*null,/gm)].map((m) => m[1]), []);
  assert.match(site, /email: '[^'@\s]+@[^'@\s]+\.[a-z]+'/);
  assert.match(site, /resumePath: '\/resume\.pdf'/);
  assert.equal(existsSync(new URL('../public/resume.pdf', import.meta.url)), true);
});

test('the about page includes a local, accessible portrait', () => {
  for (const file of ['raul-cardenas-montoya-256.webp', 'raul-cardenas-montoya-512.webp', 'raul-cardenas-montoya-256.jpg', 'raul-cardenas-montoya-512.jpg']) {
    assert.equal(existsSync(new URL(`../public/assets/${file}`, import.meta.url)), true, file);
  }
  assert.match(read('src/pages/about.astro'), /<source type="image\/webp" srcset="\/assets\/raul-cardenas-montoya-256\.webp 256w/);
  assert.match(read('src/pages/about.astro'), /<img src="\/assets\/raul-cardenas-montoya-512\.jpg"/);
  // The width/height attributes would override aspect-ratio without this.
  assert.match(read('src/styles/about.css'), /\.about-profile img \{[^}]*height: auto;/);
  assert.match(read('src/pages/about.astro'), /alt="Raul Cardenas Montoya"/);
});

test('notes publish only non-draft Markdown entries and format date-only values in UTC', () => {
  const config = read('src/content.config.ts');
  const index = read('src/pages/notes/index.astro');
  const detail = read('src/pages/notes/[...slug].astro');

  assert.match(config, /pattern: '\*\*\/\*\.md'/);
  assert.doesNotMatch(config, /mdx/);
  assert.match(index, /getCollection\('notes', \(\{ data \}\) => !data\.draft\)/);
  assert.match(detail, /getCollection\('notes', \(\{ data \}\) => !data\.draft\)/);
  assert.match(index, /timeZone: 'UTC'/);
  assert.match(detail, /timeZone: 'UTC'/);
});

test('editable project cards receive their ordinal from the rendered collection order', () => {
  assert.match(read('src/pages/index.astro'), /map\(\(project, index\) => <ProjectCard project=\{project\} index=\{index\}/);
  assert.match(read('src/components/ProjectCard.astro'), /project, index/);
  assert.doesNotMatch(read('src/components/ProjectCard.astro'), /\.indexOf\(project\.slug\)/);
});

test('project cards expose configured external project links', () => {
  const card = read('src/components/ProjectCard.astro');
  const projects = read('src/data/projects.ts');
  const styles = read('src/styles/global.css');

  assert.match(projects, /links: \{ label: string; href: string \}\[\]/);
  assert.match(card, /project\.links\.map/);
  assert.match(card, /href=\{link\.href\}/);
  assert.match(card, /\{link\.label\}/);
  assert.match(styles, /\.project-external-link/);
});

test('supported Node versions match the locked build tooling', () => {
  const packageJson = JSON.parse(read('package.json'));
  const readme = read('README.md');

  assert.equal(packageJson.engines.node, '^20.19.0 || >=22.12.0');
  assert.match(readme, /20\.19\+.*22\.12\+/);
});

test('visual foundations use accessible tokens and honor reduced motion', () => {
  const styles = read('src/styles/global.css');

  assert.match(styles, /--muted:\s*#5b6474/);
  assert.match(styles, /--accent:\s*#4f46e5/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /animation:\s*none/);
  assert.match(styles, /button:focus-visible/);
  assert.match(styles, /:focus-visible/);
});

test('the homepage ships a static neuromorphic diagram that remains usable without JavaScript', () => {
  const page = read('src/pages/index.astro');
  const island = read('src/components/NeuromorphicDemo.astro');
  const enhance = read('src/runtime/enhance-demo.ts');

  assert.match(page, /NeuromorphicDemo/);
  assert.doesNotMatch(page, /NativeEvidence/);
  assert.doesNotMatch(page, /loadPublishedNativeEvidence/);
  assert.doesNotMatch(read('docs/architecture/native-evidence.md'), /accepted for V1/);
  assert.match(read('docs/architecture/native-evidence.md'), /V2 isolated recorded-evidence surface outside the V1 critical path/);
  assert.match(read('src/data/site.ts'), /href: '\/evidence\/'/);
  assert.match(island, /data-neuromorphic-demo/);
  assert.match(island, /aria-labelledby="demo-title"/);
  assert.match(island, /<noscript>/);
  assert.match(island, /Play animation/);
  assert.match(island, /aria-live="polite"/);
  assert.match(island, /role="status"/);
  // The static first paint is a drawing of the exact live topology (#13).
  assert.match(island, /Static drawing of the live network/);
  assert.match(island, /origin="static-diagram"/);
  assert.match(island, /runtimeBound/);
  assert.doesNotMatch(island, /origin="live-wasm"/);
  assert.doesNotMatch(island, /LIVE · Rust\/WASM/);
  assert.match(read('src/components/ExecutionOrigin.astro'), /executionOriginLabel/);
  assert.match(read('src/native-evidence/types.ts'), /LIVE · Rust\/WASM/);
  assert.match(island, /href="\/evidence\/"/);
  assert.match(island, /data-demo-play hidden/);
  assert.match(enhance, /IntersectionObserver/);
  assert.match(enhance, /data-demo-origin/);
  assert.match(enhance, /astro:before-swap/);
  assert.match(enhance, /visibilitychange/);
  assert.match(enhance, /setInViewport\(visible\)\.then\(paint\)/);
  assert.match(enhance, /setDocumentHidden\(document\.hidden\)\.then\(paint\)/);
  assert.match(enhance, /onSnapshotChange\(paint\)/);
  assert.match(enhance, /pageshow/);
  assert.match(enhance, /event.persisted/);
  assert.match(enhance, /removeEventListener\('change', onMotionChange\)/);
  assert.match(enhance, /const pending = boundRuntime.play\(\)/);
  assert.match(read('src/runtime/demo-runtime.ts'), /onWorkerFailure:/);
  assert.match(read('src/runtime/demo-runtime.ts'), /onRendererError:/);
  assert.match(read('src/runtime/demo-runtime.ts'), /signal: AbortSignal/);
  assert.match(enhance, /removeEventListener\('webglcontextlost', onContextLost, contextLostCapture\)/);
  assert.match(enhance, /addEventListener\('webglcontextlost', onContextLost, contextLostCapture\)/);
  assert.doesNotMatch(island, /client:only/);
});

test('the homepage hero hosts the live demo static-first and traces it to its crates', () => {
  const page = read('src/pages/index.astro');
  const island = read('src/components/NeuromorphicDemo.astro');
  const styles = read('src/styles/hero.css');
  const telemetry = read('src/components/DemoTelemetry.astro');
  const enhance = read('src/runtime/enhance-demo.ts');

  // The hero copy stays in the page and is the first thing in the island.
  assert.match(page, /<NeuromorphicDemo>\s*<div class="hero-heading" slot="heading">/);
  assert.match(page, /<h1 id="hero-title">I build infrastructure for <em>agentic systems<\/em>, synthetic data, and model evaluation\.<\/h1>/);
  assert.match(page, /class="button button-primary" href=\{site\.resumePath\}/);
  assert.match(page, /href=\{`mailto:\$\{site\.email\}`\}/);
  assert.match(island, /<section class="hero hero-live" aria-labelledby="hero-title">/);
  assert.ok(island.indexOf('<slot />') < island.indexOf('<figure class="hero-mesh"'), 'copy precedes the mesh');

  // Static first: the build draws the audited topology into a reserved box,
  // and the WebGL surface stacks over the same box.
  assert.match(island, /staticMeshGeometry\(topology\)/);
  assert.match(island, /const topology = auditedBrowserTopology\(\);/);
  assert.match(styles, /\.hero-mesh-stage \{[^}]*aspect-ratio: 1 \/ 1;/);
  assert.match(styles, /\.hero-mesh \.demo-surface\[hidden\] \{\s*display: block;\s*visibility: hidden;/);
  assert.match(styles, /\.hero-mesh \.demo-surface:not\(\[hidden\]\) \+ \.hero-mesh-static \{ visibility: hidden; \}/);

  // RM-2354: the mesh column is at least 480 px wide at 1440 px, so the
  // 1/4-speed pulses have room to read. At that width the 1240 px shell keeps
  // 2 × 3rem gutters and the hero gap clamps to 4.5rem: 1072 px of free track
  // space shared by the two `minmax(0, …fr)` columns.
  const heroTracks = styles.match(/\.hero\.hero-live \{[\s\S]*?grid-template-columns: ([^;]+);/);
  assert.ok(heroTracks, 'the hero-live grid columns');
  const heroFr = [...heroTracks[1].matchAll(/minmax\(0, ([\d.]+)fr\)/g)].map((match) => Number(match[1]));
  assert.ok(heroFr.length === 2 && heroFr.every((fr) => fr > 0), 'two minmax(0, …fr) tracks');
  const meshColumnPx = (1240 - 96 - 72) * (heroFr[1] / (heroFr[0] + heroFr[1]));
  assert.ok(meshColumnPx >= 480, `the mesh column is ≥ 480 px at 1440 px (it is ${meshColumnPx.toFixed(1)} px)`);

  // Provenance: runtime-bound origin label, static crate links, evidence kept apart.
  assert.match(island, /simulating in this browser/);
  // The caption states the replay rate from the renderer's own constants, and
  // uses neutral wording whenever motion is off (including pauses).
  assert.match(island, /const simulationHz = 1000 \/ DEMO_TICK_MS;/);
  assert.match(island, /const pulseSpeedLabel = `1\/\$\{Math\.round\(1 \/ PULSE_DISPLAY_SPEED\)\}`;/);
  assert.match(island, /<span data-when="live">[^<]*simulating in this browser at \{simulationHz\} Hz · pulses shown at \{pulseSpeedLabel\} speed<\/span>/);
  // Reduced motion holds the camera still after Play; pulses still travel.
  assert.match(island, /<span data-when="live-still">[^<]*simulating in this browser at \{simulationHz\} Hz · pulses shown at \{pulseSpeedLabel\} speed · view held still<\/span>/);
  assert.doesNotMatch(island, /pulses off/);
  // The reduced-motion notice appears with the Play control: the media query
  // lets it show, and `data-mode` — set only when the runtime initializes —
  // is what shows it, so a no-JavaScript or fallback island, which has no
  // Play control either, never displays it.
  assert.match(island, /<p class="hero-mesh-motion-note">Your device asks for reduced motion, so the network waits until you press Play\./);
  assert.match(styles, /\.hero-mesh-motion-note \{[^}]*display: none;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{\s*\.live-hero\[data-mode='live'\] \.hero-mesh-motion-note \{ display: block; \}/);
  assert.match(styles, /\.live-hero\[data-mode='live'\]:not\(\[data-motion='off'\]\) \.hero-mesh-mode > \[data-when='live'\]/);
  assert.match(styles, /\.live-hero\[data-mode='live'\]\[data-motion='off'\] \.hero-mesh-mode > \[data-when='live-still'\]/);
  assert.match(island, /liveCrateLayers\.map/);
  assert.match(island, /href=\{crateLayerHref\(layer\)\}/);
  assert.match(island, /href="#live-telemetry"/);
  assert.match(telemetry, /id="live-telemetry"/);
  assert.match(island, /href="\/labs\/"/);
  assert.match(island, /href="\/protocol\/"/);
  assert.match(island, /CUDA and FPGA results are <a href="\/evidence\/">recorded separately<\/a> and never run in this browser/);

  // Viewport gating follows the mesh and the panel, not the whole hero.
  assert.match(island, /<figure class="hero-mesh" data-demo-viewport>/);
  assert.match(telemetry, /data-demo-viewport/);
  assert.match(enhance, /querySelectorAll\('\[data-demo-viewport\]'\)/);

  // The encoder switch: radios in the caption, bound to the runtime, no labs code.
  assert.match(island, /<fieldset class="hero-mesh-encoder" data-demo-encoder disabled>/);
  assert.match(island, /ENCODER_MODE_NAMES\.map\(\(mode\) =>/);
  assert.match(island, /checked=\{mode === DEFAULT_ENCODER_MODE\}/);
  assert.match(enhance, /boundRuntime\.setEncoderMode\(target\.value\)/);
  assert.match(enhance, /encoder\?\.removeEventListener\('change', onEncoderChange\)/);
  assert.match(styles, /\.live-hero:is\(\[data-mode='live'\], \[data-mode='awaiting-play'\], \[data-mode='initializing'\]\) \.hero-mesh-encoder \{/);

  // Reduced motion keeps an explicit Play, and a hidden Play stays hidden
  // (`.button` sets a display that would otherwise override `hidden`).
  // The homepage never loads the labs package.
  assert.match(island, /data-demo-play hidden>Play animation</);
  assert.match(read('src/styles/global.css'), /\.button\[hidden\] \{ display: none; \}/);
  assert.doesNotMatch(`${page}${island}${styles}`, /neuromorphic-adapter-labs|labs\/nir|plasticity/i);
});

test('the protocol route replays recorded corpus-ipc fixtures static-first and labels them distinctly', () => {
  assert.equal(existsSync(new URL('../src/pages/protocol.astro', import.meta.url)), true);
  const page = read('src/pages/protocol.astro');
  const card = read('src/components/ProtocolFixtureCard.astro');
  const enhance = read('src/protocol/enhance-protocol.ts');
  const inspector = read('src/protocol/inspector.ts');
  const catalog = read('src/protocol/catalog.ts');
  const styles = read('src/styles/protocol.css');

  // Static-first: rendered at build time from the checked-in fixtures.
  assert.match(page, /loadProtocolFixtureCatalog\(\)/);
  assert.match(page, /import '\.\.\/styles\/protocol\.css'/);
  assert.match(page, /data-protocol-viewer/);
  assert.match(page, /data-protocol-checks hidden/);
  assert.match(page, /role="status"/);
  assert.doesNotMatch(page, /client:(only|load|visible|idle)/);
  assert.match(card, /<pre><code>\{fixture\.text\}<\/code><\/pre>/);
  assert.match(card, /data-fixture-sha256=\{fixture\.sha256\}/);
  assert.match(card, /<details class="protocol-bytes" open>/);
  assert.match(enhance, /The recorded bytes and digests above remain the reference/);
  assert.match(inspector, /readBoundedBytes/);
  assert.doesNotMatch(`${catalog}${inspector}${enhance}`, /JSON\.parse\(\s*(text|bytes|decoder)/);

  // Distinct origin label, never the live Rust/WASM one.
  assert.match(page, /<ExecutionOrigin origin="recorded-protocol" \/>/);
  assert.doesNotMatch(page, /<ExecutionOrigin origin="live-wasm"/);
  assert.match(read('src/native-evidence/types.ts'), /PROTOCOL_ORIGIN_LABEL = 'RECORDED · corpus-ipc wire v1'/);
  assert.match(read('src/native-evidence/view.ts'), /case 'recorded-protocol':\s+return 'protocol';/);
  assert.match(styles, /\.execution-origin\[data-origin='protocol'\]/);
  assert.doesNotMatch(read('src/styles/global.css'), /data-origin='protocol'/);

  // Linked from the evidence intro; offline transport only.
  assert.match(read('src/pages/evidence.astro'), /href="\/protocol\/"/);
  assert.match(read('src/protocol/provenance.ts'), /No ZeroMQ, HTTP service, proxy, or live producer/);
  for (const file of ['manifest.json', 'kinetic-seed9-step14-stimuli.json', 'kinetic-seed9-step14-spikes.json', 'kinetic-seed9-step14-eligibility-traces.json']) {
    assert.equal(existsSync(new URL(`../public/protocol/fixtures/v1/${file}`, import.meta.url)), true, `${file} is missing`);
  }
});

test('the browser adapter keeps corpus-ipc on its no-default surface without ZeroMQ or the server', () => {
  const cargoToml = read('crates/neuromorphic-adapter/Cargo.toml');
  const policy = read('scripts/verify-browser-dependencies.mjs');
  const profiles = read('scripts/wasm-profiles.mjs');
  const packageJson = read('package.json');

  assert.match(cargoToml, /^corpus-ipc = \{ version = "=0\.1\.0", default-features = false \}$/m);
  assert.doesNotMatch(cargoToml, /corpus-ipc[^\n]*features = \[/);
  for (const name of ['zmq', 'zeromq', 'axum', 'axum-core', 'tokio', 'tokio-macros', 'hyper', 'tower', 'mio', 'socket2']) {
    assert.match(policy, new RegExp(`'${name}',`), `${name} must stay forbidden in the browser graph`);
  }
  assert.match(policy, /NATIVE_BUILD_PACKAGES = new Set\(\['bindgen', 'cc', 'cmake', 'pkg-config', 'vcpkg'\]\)/);
  assert.match(policy, /feature === 'server' \|\| feature === 'zmq'/);
  assert.match(packageJson, /node scripts\/verify-browser-dependencies\.mjs/);

  // The protocol decode path is a labs-only cargo feature.
  assert.match(cargoToml, /^protocol = \["dep:serde_json", "dep:sha2"\]$/m);
  assert.match(cargoToml, /^sha2 = \{ version = "=0\.10\.9", default-features = false, optional = true \}$/m);
  assert.match(profiles, /features: Object\.freeze\(\['nir', 'protocol', 'plasticity'\]\)/);
  assert.match(profiles, /excludedDirectDependencies: Object\.freeze\(\['nir-rs', 'serde', 'serde_json', 'sha2', 'plasticity-lab', 'limbic-critic'\]\)/);
  assert.match(read('src/protocol/provenance.ts'), /'\/wasm\/neuromorphic-adapter-labs\/neuromorphic_adapter\.js'/);
  assert.doesNotMatch(read('public/wasm/neuromorphic-adapter/neuromorphic_adapter.js'), /inspectProtocolFixture/);
  assert.match(read('public/wasm/neuromorphic-adapter-labs/neuromorphic_adapter.js'), /inspectProtocolFixture/);
});

test('page metadata includes canonical and complete social sharing basics', () => {
  const layout = read('src/layouts/BaseLayout.astro');

  assert.match(layout, /property="og:url"/);
  assert.match(layout, /property="og:image:alt"/);
  assert.match(layout, /name="twitter:title"/);
  assert.match(layout, /name="theme-color"/);
});

test('sitemap, robots.txt and a 1200x630 social card are wired up', () => {
  const png = readFileSync(new URL('../public/assets/social-card.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.match(read('astro.config.mjs'), /sitemap\(\)/);
  assert.match(read('public/robots.txt'), /^Sitemap: https:\/\/raulcardenasmontoya.me\/sitemap-index\.xml$/m);
  assert.match(read('src/layouts/BaseLayout.astro'), /og:image:width" content="1200"/);
});

test('repository identity uses raulcardenasmontoya.me', () => {
  const packageJson = JSON.parse(read('package.json'));
  const identityFiles = [
    'README.md',
    'AGENTS.md',
    'CLAUDE.md',
    'astro.config.mjs',
    'docs/coverage-and-quality.md',
    'package.json',
    'package-lock.json',
    'src/native-evidence/view.ts',
    'test/hero-live-mesh.test.mjs',
    '.github/workflows/deploy.yml',
    '.github/workflows/quality.yml',
    '.coderabbit.yaml',
    '.cursor/environment.json',
    '.agents/setup',
  ];

  assert.equal(packageJson.name, 'raulcardenasmontoya.me');
  assert.equal(packageJson.repository.type, 'git');
  assert.equal(packageJson.repository.url, 'git+https://github.com/rmems/raulcardenasmontoya.me.git');
  assert.match(read('README.md'), /^# raulcardenasmontoya\.me$/m);
  assert.match(
    read('docs/coverage-and-quality.md'),
    /https:\/\/app\.codecov\.io\/gh\/rmems\/raulcardenasmontoya\.me\b/,
  );
  assert.match(
    read('src/native-evidence/view.ts'),
    /PORTFOLIO_REPOSITORY_URL = 'https:\/\/github\.com\/rmems\/raulcardenasmontoya\.me'/,
  );
  for (const path of identityFiles) {
    assert.doesNotMatch(read(path), /raulcardenasmontoya\.dev/, `${path} still names the old repository`);
    assert.doesNotMatch(read(path), /rmems\/shipoftheseus\.dev/, `${path} still names the old repository`);
  }
});

test('portfolio stays static and deploys only through GitHub Pages', () => {
  const astroConfig = read('astro.config.mjs');
  const workflow = read('.github/workflows/quality.yml');
  const deploy = read('.github/workflows/deploy.yml');
  const readme = read('README.md');

  assert.match(astroConfig, /output:\s*'static'/);
  assert.match(astroConfig, /site:\s*'https:\/\/raulcardenasmontoya.me'/);
  assert.match(workflow, /npm run validate/);
  assert.doesNotMatch(workflow, /deploy|wrangler|cloudflare/i);
  assert.doesNotMatch(deploy, /wrangler|cloudflare|netlify/i);
  assert.match(deploy, /branches: \[main\]/);
  assert.match(deploy, /npm run validate/);
  assert.match(deploy, /npm run build/);
  assert.match(deploy, /actions\/upload-pages-artifact@[0-9a-f]{40}/);
  assert.match(deploy, /path: dist/);
  assert.match(deploy, /actions\/deploy-pages@[0-9a-f]{40}/);
  assert.match(deploy, /pages: write/);
  assert.match(deploy, /id-token: write/);
  assert.match(deploy, /name: github-pages/);
  assert.equal(read('public/CNAME').trim(), 'raulcardenasmontoya.me');
  assert.match(deploy, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(readme, /^# raulcardenasmontoya\.me$/m);
  assert.match(readme, /Custom domain: `raulcardenasmontoya.me`/);
  assert.doesNotMatch(readme, /raulcardenasmontoya\.dev|shipoftheseus\.dev/);
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.name, 'raulcardenasmontoya.me');
  assert.equal(packageJson.repository.type, 'git');
  assert.equal(packageJson.repository.url, 'git+https://github.com/rmems/raulcardenasmontoya.me.git');
  assert.equal(
    read('src/native-evidence/view.ts').match(/PORTFOLIO_REPOSITORY_URL = '([^']+)'/)?.[1],
    'https://github.com/rmems/raulcardenasmontoya.me',
  );
  assert.doesNotMatch(read('docs/coverage-and-quality.md'), /raulcardenasmontoya\.dev|shipoftheseus\.dev/);
  const deployWorkflows = readdirSync(new URL('../.github/workflows/', import.meta.url)).filter((f) => f === 'deploy.yml');
  assert.deepEqual(deployWorkflows, ['deploy.yml']);
  for (const path of ['.openai/hosting.json', 'public/_redirects', '_redirects', 'wrangler.toml', 'netlify.toml']) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, `${path} conflicts with the GitHub Pages deploy`);
  }
});

test('quality CI validates the locked Rust/WASM adapter before the frontend contract', () => {
  const workflow = read('.github/workflows/quality.yml');
  const readme = read('README.md');

  assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(workflow, /dtolnay\/rust-toolchain@fb523f40495206854c36b250850817ae0f83e3d1/);
  assert.match(workflow, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.match(workflow, /wasm32-unknown-unknown/);
  assert.match(workflow, /cargo fmt --manifest-path crates\/neuromorphic-adapter\/Cargo\.toml --check/);
  assert.match(workflow, /cargo clippy --manifest-path crates\/neuromorphic-adapter\/Cargo\.toml --locked --all-targets -- -D warnings/);
  assert.match(workflow, /cargo test --manifest-path crates\/neuromorphic-adapter\/Cargo\.toml --locked/);
  assert.match(workflow, /cargo check --manifest-path crates\/neuromorphic-adapter\/Cargo\.toml --locked --target wasm32-unknown-unknown/);
  assert.match(workflow, /taiki-e\/install-action@4cef1412cce204788f482e778a0b9187f9626a29 # v2\n {8}with:\n {10}tool: wasm-bindgen@0\.2\.126/);
  assert.match(workflow, /cargo llvm-cov \\\s+--manifest-path crates\/neuromorphic-adapter\/Cargo\.toml \\\s+--all-targets \\\s+--all-features \\/);
  assert.match(workflow, /browser-actions\/setup-chrome@c785b87e244131f27c9f19c1a33e2ead956ab7ce/);
  assert.match(workflow, /chrome-version: stable/);
  assert.match(workflow, /BROWSER_BIN="\$\{\{ steps\.chrome\.outputs\.chrome-path \}\}" npm run validate/);
  const packageJson = read('package.json');
  assert.match(packageJson, /"validate:rust":/);
  assert.match(packageJson, /"validate": "npm test && npm run lint && npm run typecheck && npm run build && npm run validate:rust && npm run test:wasm-adapter && npm run test:wasm-web-pkg && npm run test:wasm-browser && npm run test:layout"/);
  assert.match(readme, /Rust 1\.99\.0/);
  assert.match(readme, /wasm32-unknown-unknown/);
  assert.match(readme, /wasm-bindgen-cli 0\.2\.126/);
});

test('primary navigation lists Labs between Evidence and About', () => {
  const site = read('src/data/site.ts');
  const evidence = site.indexOf("{ href: '/evidence/', label: 'Evidence', requires: 'evidence' }");
  const labs = site.indexOf("{ href: '/labs/', label: 'Labs' }");
  const about = site.indexOf("{ href: '/about/', label: 'About' }");

  assert.ok(evidence >= 0 && labs > evidence && about > labs, 'Labs must sit between Evidence and About');
  assert.equal(site.match(/label: 'Labs'/g).length, 1);
});

test('the labs index is a list driven by one data array', () => {
  const index = read('src/pages/labs/index.astro');
  const labs = read('src/data/labs.ts');

  assert.match(index, /labs\.map\(\(lab\) =>/);
  // Honesty rule: a live-wasm lab has no runtime on the static index, so it must
  // render the static "UNAVAILABLE · Rust/WASM" state instead of asserting LIVE
  // where no runtime runs. The index has no script to upgrade the badge, so no
  // runtimeBound flag is passed here (unlike the lab page).
  assert.match(
    index,
    /<ExecutionOrigin origin=\{lab\.origin === 'live-wasm' \? 'unavailable-wasm' : lab\.origin\} \/>/,
  );
  assert.match(index, /href=\{lab\.href\}/);
  assert.match(labs, /export const labs: readonly LabEntry\[\] = \[/);
  assert.match(labs, /href: '\/labs\/nir\/'/);
  assert.match(labs, /origin: 'imported-nir'/);
  assert.match(labs, /href: '\/labs\/plasticity\/'/);
  assert.match(labs, /origin: 'live-wasm',\s*\n\s*crates: \['limbic-critic', 'plasticity-lab', 'neuromod'\]/);
});

test('the plasticity lab is static-first, keeps reward state apart from spike state, and states its limits', () => {
  const page = read('src/pages/labs/plasticity.astro');
  const enhance = read('src/runtime/enhance-plasticity.ts');
  const runtime = read('src/runtime/plasticity-lab.ts');
  const styles = read('src/styles/plasticity-lab.css');

  // Static first: the committed golden session renders at build time.
  assert.match(page, /scripted-session\.v1\.json\?raw/);
  assert.match(page, /parsePlasticityGolden\(JSON\.parse\(goldenText\)\)/);
  assert.match(page, /data-plasticity-golden-source/);
  assert.match(page, /goldenRows\.map\(\(row\) =>/);
  assert.match(page, /data-plasticity-controls hidden/);
  assert.match(page, /data-plasticity-live hidden/);
  assert.match(page, /<noscript>/);
  assert.match(page, /role="status"/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /<ExecutionOrigin origin="unavailable-wasm" runtimeBound \/>/);
  assert.match(page, /import '\.\.\/\.\.\/styles\/plasticity-lab\.css'/);
  assert.doesNotMatch(page, /client:/);

  // Reward/modulator state and neuron/spike state live in separate panels.
  assert.match(page, /data-plasticity-panel="reward"/);
  assert.match(page, /data-plasticity-panel="network"/);
  assert.ok(page.indexOf('data-plasticity-panel="reward"') < page.indexOf('data-plasticity-panel="network"'));
  assert.ok(!page.slice(page.indexOf('data-plasticity-panel="reward"'), page.indexOf('data-plasticity-panel="network"')).includes('data-plasticity-raster'));
  assert.match(styles, /\.plasticity-panel-reward \{\s*border: 1px dashed var\(--accent\)/);
  assert.match(styles, /\.plasticity-panel-network \{\s*border: 1px solid var\(--ink\)/);

  // Enabled mechanisms and the limits of the crates are stated plainly.
  assert.match(page, /What is enabled, exactly\./);
  assert.match(page, /not an actor-critic/);
  assert.match(page, /No penalty-driven weakening/);
  assert.match(page, /SimpleCritic::try_assess/);
  assert.match(page, /bridge::to_neuromodulators/);
  assert.match(page, /train_step_with_modulators_and_rng/);
  assert.match(page, /run_eval_with_rng/);

  // Bounded buffers, throttled rendering, pausing, and reduced motion.
  assert.match(runtime, /createSpikeRaster/);
  assert.match(runtime, /export const PLASTICITY_HISTORY_STEPS = \d+;/);
  assert.match(enhance, /createFlushScheduler/);
  assert.match(enhance, /prefers-reduced-motion: reduce/);
  assert.match(enhance, /visibilitychange/);
  assert.match(enhance, /IntersectionObserver/);
  assert.match(enhance, /document\.hidden/);
  assert.match(enhance, /astro:before-swap/);
  assert.match(enhance, /pagehide/);
  assert.match(enhance, /session\?\.dispose\(\)/);
  assert.match(enhance, /executionOriginLabel\(originKind\)/);

  // Every step, from Run or Step, consumes the one-slot reward input queue;
  // nothing calls the session's step directly. The controls' behavior is
  // exercised end to end in test/plasticity-lab-dom.test.mjs; these checks
  // only keep the single step path from being bypassed.
  assert.equal(enhance.match(/stepWithRewardInput\(session, stimulus, rewardInput\)/g)?.length, 1);
  assert.doesNotMatch(enhance, /session\.step\(/);
  assert.match(enhance, /case 'step':\s*\n\s*if \(!stepOnce\(selectedStimulus\(\)\)\) return;/);
  assert.match(enhance, /if \(stepOnce\(selectedStimulus\(\)\)\) \{\s*\n\s*scheduler\.request\(\);/);
  assert.match(enhance, /case 'new-episode':[\s\S]*?rewardInput\.clear\(\);[\s\S]*?session\.newEpisode\(\);/);
  assert.match(enhance, /const freshSession = \(\) => \{[\s\S]*?rewardInput\.clear\(\);/);
  assert.match(page, /data-plasticity-field="queued"/);
});

test('the plasticity lab ships only in the labs package and never touches the homepage', () => {
  const lib = read('crates/neuromorphic-adapter/src/lib.rs');
  const manifest = read('crates/neuromorphic-adapter/Cargo.toml');

  assert.match(lib, /#\[cfg\(feature = "plasticity"\)\]\s*\npub mod plasticity;/);
  assert.match(manifest, /^plasticity = \["dep:limbic-critic", "dep:plasticity-lab"\]$/m);
  assert.match(manifest, /^\[\[test\]\]\r?\nname = "plasticity_session"\r?\nrequired-features = \["plasticity"\]$/m);
  assert.match(read('src/runtime/plasticity-lab.ts'), /'\/wasm\/neuromorphic-adapter-labs\/neuromorphic_adapter\.js'/);
  assert.match(read('public/wasm/neuromorphic-adapter-labs/neuromorphic_adapter.js'), /WasmPlasticityLab/);
  assert.doesNotMatch(read('public/wasm/neuromorphic-adapter/neuromorphic_adapter.js'), /WasmPlasticityLab/);
  for (const path of ['src/pages/index.astro', 'src/components/NeuromorphicDemo.astro', 'src/runtime/enhance-demo.ts', 'src/runtime/wasm-session.ts', 'src/runtime/neuromorphic-worker.ts']) {
    assert.doesNotMatch(read(path), /plasticity|neuromorphic-adapter-labs/i, `${path} must not reach the plasticity lab`);
  }
  assert.match(read('.gitattributes'), /^src\/data\/plasticity\/\*\.json text eol=lf$/m);
});

test('the NIR lab is static-first and labelled as imported structure, not the live simulation', () => {
  const page = read('src/pages/labs/nir.astro');
  const enhance = read('src/runtime/enhance-nir.ts');
  const types = read('src/native-evidence/types.ts');
  const home = read('src/pages/index.astro');
  const demo = read('src/components/NeuromorphicDemo.astro');

  assert.match(page, /<ExecutionOrigin origin="imported-nir" \/>/);
  assert.match(types, /IMPORTED_NIR_ORIGIN_LABEL = 'IMPORTED · NIR structure'/);
  assert.match(page, /not a simulation/);
  assert.match(page, /data-nir-lab/);
  assert.match(page, /layoutNirDiagram\(projection\)/);
  assert.match(page, /lif-readout-example\.v1\.inspection\.json\?raw/);
  assert.match(page, /data-nir-static-projection/);
  assert.match(page, /<svg viewBox=/);
  assert.match(page, /href=\{`#\$\{node\.anchorId\}`\}/);
  assert.match(page, /<table class="nir-field-table">/);
  assert.match(page, /<noscript>/);
  assert.match(page, /role="status"/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /data-nir-inspector aria-label="Operator inspector" hidden/);
  assert.match(page, /import '\.\.\/\.\.\/styles\/nir-lab\.css'/);
  assert.doesNotMatch(page, /client:/);
  assert.doesNotMatch(page, /origin="live-wasm"/);
  assert.match(enhance, /astro:before-swap/);
  assert.match(enhance, /pagehide/);
  assert.match(enhance, /session\?\.dispose\(\)/);
  assert.doesNotMatch(home, /labs\/nir|imported-nir/);
  assert.doesNotMatch(demo, /imported-nir/);
});

test('the NIR browser path never ships native HDF5', () => {
  const manifest = read('crates/neuromorphic-adapter/Cargo.toml');
  const policy = read('scripts/verify-browser-dependencies.mjs');

  assert.match(manifest, /nir-rs = \{ version = "=0\.4\.5", default-features = false, features = \["serde"\], optional = true \}/);
  assert.match(manifest, /\[features\]\s*\ndefault = \[\]/);
  assert.match(manifest, /nir = \["dep:nir-rs", "dep:serde", "dep:serde_json"\]/);
  assert.doesNotMatch(manifest, /hdf5/);
  assert.match(policy, /\/hdf5\/i\.test\(pkg\.name\)/);
  assert.match(policy, /NATIVE_FEATURES = new Set\(\['hdf5'\]\)/);
  assert.equal(existsSync(new URL('../public/nir/lif-readout-example.v1.json', import.meta.url)), true);
  assert.doesNotMatch(read('public/nir/lif-readout-example.v1.json'), /\.nir"|hdf5/i);
});

test('NIR inspection ships only in the labs package, never in the homepage package', () => {
  const lib = read('crates/neuromorphic-adapter/src/lib.rs');
  const packageJson = JSON.parse(read('package.json'));
  const rust = packageJson.scripts['validate:rust'];

  assert.match(lib, /#\[cfg\(feature = "nir"\)\]\s*\npub mod nir;/);
  for (const command of ['clippy', 'test', 'check']) {
    const runs = rust.split(' && ').filter((step) => step.includes(` ${command} `));
    assert.equal(runs.length, 2, `${command} must run for the default build and with every labs feature`);
    assert.equal(runs.filter((step) => step.includes('--all-features')).length, 1, command);
    assert.equal(runs.filter((step) => step.includes('--features')).length, 0, `${command} uses --all-features, not a partial list`);
  }
  assert.match(rust, /node scripts\/verify-browser-dependencies\.mjs$/);
  assert.match(read('src/runtime/nir-inspection.ts'), /'\/wasm\/neuromorphic-adapter-labs\/neuromorphic_adapter\.js'/);
  assert.match(read('src/runtime/wasm-session.ts'), /'\/wasm\/neuromorphic-adapter\/neuromorphic_adapter\.js'/);
  assert.match(read('scripts/wasm-profiles.mjs'), /outputDirectory: 'public\/wasm\/neuromorphic-adapter-labs'/);
  for (const file of ['neuromorphic_adapter.js', 'neuromorphic_adapter.d.ts', 'neuromorphic_adapter_bg.wasm']) {
    assert.equal(existsSync(new URL(`../public/wasm/neuromorphic-adapter-labs/${file}`, import.meta.url)), true, file);
  }
  assert.doesNotMatch(read('public/wasm/neuromorphic-adapter/neuromorphic_adapter.js'), /WasmNirInspection/);
});

test('the brand, footer, and contact page lead with Raul Cardenas Montoya, email, and the résumé', () => {
  const header = read('src/components/SiteHeader.astro');
  const layout = read('src/layouts/BaseLayout.astro');
  const contact = read('src/pages/contact.astro');
  assert.match(read('src/data/site.ts'), /name: 'Raul Cardenas Montoya'/);
  assert.match(header, /<span>\{site\.name\}<\/span>/);
  assert.match(header, /mailto:\$\{site\.email\}/);
  assert.doesNotMatch(header + layout, /Ship of Theseus/);
  assert.match(layout, /\{site\.fullName\}<\/p>/);
  assert.ok(contact.indexOf('mailto:') < contact.indexOf('profiles.map'), 'email comes first on Contact');
});

test('Evidence and Notes stay out of the nav until they have published entries; Projects folds into Work', () => {
  const site = read('src/data/site.ts');
  const header = read('src/components/SiteHeader.astro');
  assert.match(site, /label: 'Evidence', requires: 'evidence'/);
  assert.match(site, /label: 'Notes', requires: 'notes'/);
  assert.match(header, /navigation\.filter\(\(item\) => !item\.requires \|\| available\[item\.requires\]\)/);
  assert.equal(existsSync(new URL('../src/pages/projects.astro', import.meta.url)), false);
  assert.match(read('astro.config.mjs'), /'\/projects\/': '\/work\/'/);
});

test('the about page is first person and the main pages carry their own meta descriptions', () => {
  const about = read('src/pages/about.astro');
  assert.match(about, /<h1 id="about-title">About \{site\.fullName\}<\/h1>/);
  assert.match(about, /<p>I'm \{site\.fullName\}, an AI engineer born in Los Angeles and raised in San Marcos, Texas/);
  assert.match(about, /import '\.\.\/styles\/about\.css';/);
  const headings = [...about.matchAll(/<h2>([^<]+)<\/h2>/g)].map((match) => match[1]);
  assert.deepEqual(headings, ['Why I build AI', 'What I build', 'Education', 'Tools and contact']);
  assert.match(about, /description=\{`\$\{site\.fullName\} is an AI engineer in San Marcos, Texas/);
  assert.match(about, /Western Governors University, expected September 2027/);
  assert.match(about, /Texas State University \(Electrical Engineering, Spring 2026\), Concordia University Texas \(Computer Science, Fall 2025\), and Austin Community College \(2019–2020 and 2024–2025\)/);
  assert.doesNotMatch(about, /Concordia Texas University|2023/);
  assert.doesNotMatch(about, /\b\d+ (?:datasets|crates|downloads)\b|\b\d{1,3},\d{3}\b/);
  assert.doesNotMatch(about, /systems-minded approach/);
  for (const page of ['index', 'about', 'manifesto', 'contact', 'resume']) {
    // A literal string, or a template expression that derives counts from the snapshots.
    assert.match(read(`src/pages/${page}.astro`), /<BaseLayout[^>]* description=(?:"[^"]{40,}"|\{`[^`]{40,}`\})/, page);
  }
});

test('the manifesto page publishes the full essay with typographic apostrophes, proof links, and nav entry', () => {
  const site = read('src/data/site.ts');
  const home = read('src/pages/index.astro');
  const manifesto = read('src/pages/manifesto.astro');

  assert.match(site, /\{ href: '\/manifesto\/', label: 'Manifesto' \}/);
  assert.match(manifesto, /<BaseLayout\s+preloadSerif/);
  assert.match(manifesto, /import '\.\.\/styles\/manifesto\.css';/);

  // Lead paragraph without the stale second sentence.
  assert.match(
    manifesto,
    /I build AI to help people, not replace them\. Understanding what that means to me took several changes of direction and a failed attempt at an AI tutor\./,
  );
  assert.doesNotMatch(manifesto, /But the story began with a concussion/);

  // Five sections and exact narrative milestones.
  assert.match(manifesto, /Why I build AI/);
  assert.match(manifesto, /In 7th grade, a hit in football changed my brain/);
  assert.match(manifesto, /I hit one deadline and missed the other by a day\./);
  assert.match(manifesto, /Turning into a doomer/);
  assert.match(manifesto, /The fallout at TXST and my anger at the system solidified that withdrawal\./);
  assert.match(manifesto, /I wasn’t less necessary that night\. I was the point\./);
  assert.match(manifesto, /Now, I am not a doomer/);
  assert.match(manifesto, /I’ll tell you the truth I have: there’s still a place for you\. I found mine on the fourth try\./);
  assert.match(manifesto, /My hope/);
  assert.match(manifesto, /What I’ll hold to as an AI Engineer/);

  // Principles point at existing proof targets and preserve list semantics in Safari VoiceOver.
  assert.match(manifesto, /<ol class="manifesto-principles" role="list">/);
  assert.match(manifesto, /<blockquote class="manifesto-pullquote">/);
  assert.doesNotMatch(manifesto, /<span class="manifesto-pullquote">/);
  assert.match(manifesto, /href="\/work\/#agoge-forger"/);
  assert.match(manifesto, /href="\/work\/#synthetic-factory"/);
  assert.match(manifesto, /href="\/artifacts\/"/);

  // All apostrophes in the manifesto body are typographic (’), never straight (').
  const body = manifesto.slice(manifesto.indexOf('<header class="manifesto-hero"'));
  assert.doesNotMatch(body, /'/, 'manifesto body must use typographic apostrophes (’)');

  // Homepage remains untouched by manifesto copy.
  assert.doesNotMatch(home, /concussion|doomer|Jacob Coxon/i);
});

