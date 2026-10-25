export type ProjectStatus = 'Active research' | 'In development' | 'Exploration';
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
  links: { label: string; href: string }[];
  featured: boolean;
}

const repository = (href: string) => [{ label: 'Repository', href }];

interface ProjectExtras {
  links?: Project['links'];
  featured?: boolean;
  shipped?: string;
}

const project = (
  name: string,
  slug: string,
  status: ProjectStatus,
  category: string,
  technologies: string[],
  summary: string,
  questions: string[],
  { links = [], featured = true, shipped }: ProjectExtras = {},
): Project => ({ name, slug, status, category, technologies, summary, questions, shipped, links, featured });

export const projects: Project[] = [
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
    },
  ),
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
    },
  ),
  project(
    'agoge-forger',
    'agoge-forger',
    'In development',
    'Post-training research',
    ['Python', 'PyTorch', 'TRL', 'PEFT'],
    'A post-training research platform for reproducible SFT, evaluation, checkpoints and experiment manifests. In the recorded run, SFT taught fence formatting: fence-normalized 10/16 before and after.',
    [
      'What does a run need to record to be reproduced from its manifest?',
      'Which evaluation changes reflect formatting rather than capability?',
    ],
    {
      links: repository('https://github.com/rmems/agoge-forger'),
      shipped:
        'Every training run records a reproducibility manifest, GPU telemetry and artifact digests. The CLI reports resume and export readiness per run, runs a held-out base-versus-SFT canary, and verifies a reproducibility bundle offline.',
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
        'A reviewed generator registry, a fail-closed rights policy in which unknown provenance resolves to blocked, append-only raw JSONL, and {{factoryDatasets}} public datasets on Hugging Face across {{factoryCollections}} collections as of {{datasetsAsOf}}.',
    },
  ),
  project(
    'Neuromorphic crate stack',
    'neuromorphic-crate-stack',
    'Active research',
    'Limen Neural',
    ['Rust', 'Spiking neural networks', 'NIR', 'CUDA', 'FPGA export'],
    'A solo research organisation of small Rust crates for spiking neural networks, one concern per repository: sensory encoding, neuron dynamics, wiring and delays, NIR interchange, reward-modulated training loops, transport, and CUDA kernels.',
    [
      'Which crate boundaries hold when a real pipeline, like the browser demo, composes them?',
      'What must each layer expose for a network to move between a simulator and hardware?',
    ],
    {
      links: [{ label: 'Organisation', href: 'https://github.com/Limen-Neural/' }],
      shipped:
        '{{crates}} crates on crates.io as of {{cratesAsOf}}. The homepage demo runs axon-encoder, neuromod, synaptic-wiring and kinetic-signals in the browser, and the plasticity lab runs limbic-critic and plasticity-lab.',
    },
  ),
  project(
    'Grok-1/SAAQ research',
    'grok-1-saaq-research',
    'Exploration',
    'Research exploration',
    ['Quantization', 'Neuromorphic computing', 'Research engineering'],
    'An ongoing exploration of quantization and neuromorphic, brain-inspired systems through careful research and prototype-oriented engineering.',
    [
      'Where do quantization and brain-inspired architectures create useful research questions?',
      'How can prototype-oriented engineering keep exploratory work legible?',
    ],
    {
      featured: false,
      shipped:
        'Public research artifacts in the Grok-1 dissection collection on Hugging Face: the structural parse inventory, the ternary quantization experiment reports, and the GOZ1 packs.',
    },
  ),
];
