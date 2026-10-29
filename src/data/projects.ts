export type ProjectStatus = 'Active research' | 'Active research, long-term' | 'In development' | 'Exploration';
export interface Project {
  name: string;
  slug: string;
  status: ProjectStatus;
  category: string;
  technologies: string[];
  summary: string;
  questions: string[];
  /**
   * What the linked repository already shows as done, in one or two sentences.
   * Only state what the README or the published artifact shows. `{{name}}`
   * tokens are filled from the dated snapshots (src/artifacts/counts.ts) so no
   * count is typed here.
   */
  shipped?: string;
  /** Heading for the `shipped` line; defaults to "Shipped". */
  shippedLabel?: string;
  /** Where the work is going, stated as plainly as its status. Never a result. */
  next?: string;
  /**
   * Snapshot-backed public evidence, in one sentence. Every number comes from
   * a `{{token}}` filled from the dated snapshots, never typed by hand.
   */
  evidence?: string;
  /**
   * One verifiable headline result for the card, short enough to scan. Counts
   * come from `{{token}}`s; text states only what the linked artifact shows.
   */
  headline?: string;
  /** One plain-language sentence saying why the work matters. No numbers, no outcome claims. */
  whyItMatters?: string;
  links: { label: string; href: string }[];
  featured: boolean;
}

const repository = (href: string) => [{ label: 'Repository', href }];

interface ProjectExtras {
  links?: Project['links'];
  featured?: boolean;
  shipped?: string;
  shippedLabel?: string;
  next?: string;
  evidence?: string;
  headline?: string;
  whyItMatters?: string;
}

const project = (
  name: string,
  slug: string,
  status: ProjectStatus,
  category: string,
  technologies: string[],
  summary: string,
  questions: string[],
  { links = [], featured = true, shipped, shippedLabel, next, evidence, headline, whyItMatters }: ProjectExtras = {},
): Project => ({ name, slug, status, category, technologies, summary, questions, shipped, shippedLabel, next, evidence, headline, whyItMatters, links, featured });

export const projects: Project[] = [
  project(
    'engram-parser',
    'engram-parser',
    'In development',
    'Model tooling',
    ['Rust', 'GGUF', 'Safetensors', 'Checkpoint formats'],
    'A pure-Rust checkpoint and tensor substrate for GGUF and Safetensors, with one format-independent API for tensor inventory, metadata and raw payload access.',
    [
      'How much of a checkpoint can callers read without branching on the container format?',
      'Which format-specific surfaces, such as K-quant dequantization or mmap reads, belong behind features?',
    ],
    {
      links: repository('https://github.com/rmems/engram-parser'),
      shipped:
        'On crates.io. GGUF v3 parsing, the format-independent Checkpoint API, packed K-quant dequantization (Q8_0, Q5_K, Q6_K, IQ3_M) and MoE per-expert extraction on the default build; the Safetensors and mmap readers sit behind features.',
      evidence:
        'engram-parser {{engramParserVersion}} on crates.io with {{engramParserDownloads}} downloads as of {{cratesAsOf}} (CI and mirror traffic included).',
      next: 'Widen MoE per-expert extraction coverage and keep the Safetensors and mmap paths behind features while holding wire compatibility with checked-in fixtures.',
      headline: '{{engramParserDownloads}} crates.io downloads as of {{cratesAsOf}}',
      whyItMatters: 'Checkpoints arrive in different formats, and one careful reader means less glue code before research can start.',
    },
  ),
  project(
    'Neuromorphic crate stack',
    'neuromorphic-crate-stack',
    'Active research',
    'Limen Neural',
    ['Rust', 'Spiking neural networks', 'NIR', 'CUDA', 'FPGA export'],
    'A solo research organization of small Rust crates for spiking neural networks, one concern per repository: sensory encoding, neuron dynamics, wiring and delays, NIR interchange, reward-modulated training loops, transport, and CUDA kernels.',
    [
      'Which crate boundaries hold when a real pipeline, like the browser demo, composes them?',
      'What must each layer expose for a network to move between a simulator and hardware?',
    ],
    {
      links: [{ label: 'Organization', href: 'https://github.com/Limen-Neural/' }],
      shipped:
        'The homepage demo runs axon-encoder, neuromod, synaptic-wiring and kinetic-signals in the browser, and the plasticity lab runs limbic-critic and plasticity-lab.',
      evidence:
        '{{crates}} published crates site-wide on crates.io with {{cratesTotalDownloads}} total downloads as of {{cratesAsOf}} (CI and mirror traffic included).',
      next: 'Hold the crate boundaries through the browser demo and plasticity lab compositions, and carry a network from simulator toward hardware export.',
      headline: '{{crates}} published crates site-wide on crates.io',
      whyItMatters: 'Small crates with one concern each are easier to test, replace, and carry from a laptop demo to hardware.',
    },
  ),
  project(
    'Synthetic Factory',
    'synthetic-factory',
    'In development',
    'Data systems',
    ['Python', 'Deterministic pipelines', 'Provenance', 'Validation'],
    'Deterministic infrastructure for building provenance-focused synthetic engineering data, with an emphasis on executable sources and inspectable generation paths.',
    [
      'How can generated engineering data retain a clear path back to executable sources?',
      'What validation makes a deterministic pipeline easier to inspect and revise?',
    ],
    {
      links: repository('https://github.com/rmems/synthetic-factory'),
      shipped:
        'A reviewed generator registry, a fail-closed rights policy in which unknown provenance resolves to blocked, and append-only raw JSONL with deterministic compose and export gates.',
      evidence:
        '{{factoryDatasets}} datasets across {{factoryCollections}} Synthetic Factory collections, of {{datasets}} public datasets as of {{datasetsAsOf}}.',
      next: 'Keep the generator registry reviewed and the fail-closed rights policy, and extend deterministic curation with auditable compose and export gates.',
      headline: '{{factoryDatasets}} public datasets on Hugging Face',
      whyItMatters: 'Training data is easier to trust when every line points back to the executable source that made it.',
    },
  ),
  project(
    'agoge-forger',
    'agoge-forger',
    'In development',
    'Post-training research',
    ['Python', 'PyTorch', 'TRL', 'PEFT'],
    'A post-training research platform for reproducible SFT, evaluation, checkpoints and experiment manifests. In the recorded run, the SFT gain was formatting, not capability: with outputs fence-normalized, base and SFT scored the same 10/16 on hidden cases (2 improved, 2 regressed, 12 tied).',
    [
      'What does a run need to record to be reproduced from its manifest?',
      'Which evaluation changes reflect formatting rather than capability?',
    ],
    {
      links: repository('https://github.com/rmems/agoge-forger'),
      shipped:
        'Every training run records a reproducibility manifest, GPU telemetry and artifact digests. The CLI reports resume and export readiness per run, runs a held-out base-versus-SFT canary, and verifies a reproducibility bundle offline.',
      evidence:
        'Consumes data from the Synthetic Factory collections; no separate crate or dataset published from this brief as of {{datasetsAsOf}}.',
      next: 'Keep every run sealed with manifest, telemetry digests and frozen split, and keep the held-out base-versus-SFT canary the gate before any capability claim.',
      headline: 'Recorded run: SFT gain was formatting, not capability (10/16 base, 10/16 SFT)',
      whyItMatters: 'Post-training is easier to trust when every run can be rechecked from its manifest instead of its log line.',
    },
  ),
  project(
    'nir-rs',
    'nir-rs',
    'In development',
    'Neuromorphic tooling',
    ['Rust', 'NIR', 'HDF5', 'Spiking neural networks'],
    'A pure-Rust implementation of the Neuromorphic Intermediate Representation: typed NIR graphs with opt-in HDF5 read and write that follows the official Python wire format.',
    [
      'How closely can a Rust graph model track the reference implementation on the wire?',
      'Which dependencies, such as native HDF5, should stay opt-in?',
    ],
    {
      links: repository('https://github.com/Limen-Neural/nir-rs'),
      shipped:
        'On crates.io. The NIR graph model with the standard node types, HDF5 .nir read and write behind the hdf5 feature, and compatibility claims against the Python reference that are backed by checked-in fixtures.',
      evidence:
        'nir-rs {{nirVersion}} on crates.io with {{nirDownloads}} downloads as of {{cratesAsOf}} (CI and mirror traffic included).',
      next: 'Track the reference implementation on the wire for the standard node types, keeping native HDF5 opt-in.',
      headline: '{{nirDownloads}} crates.io downloads as of {{cratesAsOf}}',
      whyItMatters: 'A shared interchange format lets a network move between simulators and hardware without being rewritten.',
    },
  ),
  project(
    'Ship of Theseus Workstation',
    'ship-of-theseus-workstation',
    'Active research',
    'Research infrastructure',
    ['Linux', 'GPU compute', 'Self-hosting', 'Reproducible systems'],
    'An AI/HPC research node and self-hosted engineering environment designed for hands-on systems work, experiments, and durable local workflows.',
    [
      'How can a local research environment make experiments easier to inspect and repeat?',
      'Which parts of the system should be reproducible rather than dependent on workstation state?',
    ],
    {
      links: repository('https://github.com/rmems/Ship-of-Theseus-Workstation'),
      shipped:
        'The node itself, documented as infrastructure: a Ryzen 9 9950X, an RTX 5080 with 16 GB, 64 GB of DDR5-6000 and two NVMe drives on Fedora Linux, used as a self-hosted GitHub Actions runner for GPU and RTL workloads.',
      evidence:
        'Infrastructure only; no crate or dataset is published from this brief as of {{cratesAsOf}}.',
      next: 'Keep the node reproducible from versioned configuration and keep the GPU and RTL runner paths inspectable.',
      headline: 'Self-hosted GitHub Actions runner for GPU and RTL work',
      whyItMatters: 'Durable local workflows make experiments easier to inspect and repeat without depending on workstation state.',
    },
  ),
  project(
    'Grok-1/SAAQ research',
    'grok-1-saaq-research',
    'Active research, long-term',
    'Research programme',
    ['Quantization', 'Mixture of experts', 'Rust', 'Research engineering'],
    'A long-term research programme on activity-aware quantization (SAAQ). The problem: fitting a very large open-weight mixture-of-experts checkpoint, Grok-1 at about 318 GB, onto personal hardware with an RTX 5080 and 16 GB of VRAM. It matters beyond one workstation because the cost of inference decides whether open-weight models can run on premises or at the edge. The hypothesis is that precision can follow measured activity, spending bits where experts and weights are used and saving them where they are not. SAAQ is a standalone programme, kept separate from Spikenaut, and there is no validated result yet.',
    [
      'Can measured activity guide per-expert precision without losing what the model can do?',
      'What run artifact would make a SAAQ result trustworthy enough to cite?',
    ],
    {
      featured: false,
      shippedLabel: 'What exists today',
      shipped:
        'The Grok-1 dissection collection on Hugging Face (the structural parse inventory, the ternary quantization experiment reports and the GOZ1 packs) and the repositories: corinth-canal, the Rust hybrid MoE/SNN runner; xai-dissect, a Rust CLI for raw Grok-1 shards; magere-brug, the artifact registry with recipes and manifests; and combine-for-AI, a neutral benchmark harness.',
      evidence:
        '{{grokDatasets}} datasets in the Grok-1 dissection collection across {{grokCollections}} collections as of {{datasetsAsOf}}.',
      next:
        'The formulation is still being searched for. There is no trusted run artifact to cite yet, and the brief will name a result only once a run is published with its manifest.',
      headline: '{{grokDatasets}} datasets in the Grok-1 dissection collection',
      whyItMatters: 'The cost of inference decides whether open-weight models can run on premises or at the edge.',
      links: [
        { label: 'Hugging Face collection', href: 'https://huggingface.co/collections/rmems/grok-1-dissection-and-ternary-packing-6a7927095f6a7ca444f003af' },
        { label: 'corinth-canal', href: 'https://github.com/rmems/corinth-canal' },
        { label: 'xai-dissect', href: 'https://github.com/rmems/xai-dissect' },
        { label: 'magere-brug', href: 'https://github.com/rmems/magere-brug' },
        { label: 'combine-for-AI', href: 'https://github.com/rmems/combine-for-AI' },
      ],
    },
  ),
];
