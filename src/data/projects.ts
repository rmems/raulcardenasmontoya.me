export type ProjectStatus = 'Active research' | 'In development' | 'Exploration';
export interface Project {
  name: string;
  slug: string;
  status: ProjectStatus;
  category: string;
  technologies: string[];
  summary: string;
  questions: string[];
  links: { label: string; href: string }[];
  featured: boolean;
}

const repository = (href: string) => [{ label: 'Repository', href }];

const project = (
  name: string,
  slug: string,
  status: ProjectStatus,
  category: string,
  technologies: string[],
  summary: string,
  questions: string[],
  links: Project['links'] = [],
  featured = true,
): Project => ({ name, slug, status, category, technologies, summary, questions, links, featured });

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
    repository('https://github.com/rmems/Ship-of-Theseus-Workstation'),
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
    repository('https://github.com/rmems/engram-parser'),
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
    repository('https://github.com/Limen-Neural/nir-rs'),
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
    repository('https://github.com/rmems/agoge-forger'),
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
    repository('https://github.com/rmems/synthetic-factory'),
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
    [],
    false,
  ),
];
