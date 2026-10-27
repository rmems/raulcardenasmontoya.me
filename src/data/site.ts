export const site = {
  name: 'Raul Cardenas Montoya',
  fullName: 'Raul Cardenas Montoya',
  title: 'AI Engineer',
  description: 'Raul Cardenas Montoya — AI Engineer. AI/ML systems engineering across agentic systems, GPU compute, neuromorphic research, and reproducible software.',
  email: 'montoyaraul34@gmail.com',
  social: {
    github: 'https://github.com/rmems',
    linkedin: 'https://www.linkedin.com/in/raul-cardenas-montoya',
    huggingface: 'https://huggingface.co/rmems',
    x: 'https://x.com/KeepOnSpiking',
    instagram: 'https://www.instagram.com/KeepOnSpiking',
    threads: 'https://www.threads.com/@KeepOnSpiking',
    cratesio: 'https://crates.io/users/rmems',
  },
  resumePath: '/resume.pdf',
} as const;

// Evidence and Notes only show in the nav once their collections have a
// published entry (decided at build time in SiteHeader.astro). The pages
// themselves still build, so direct links and the sitemap keep working.
export type NavItem = { href: string; label: string; requires?: 'evidence' | 'notes' };

export const navigation: NavItem[] = [
  { href: '/work/', label: 'Work' },
  { href: '/evidence/', label: 'Evidence', requires: 'evidence' },
  { href: '/labs/', label: 'Labs' },
  { href: '/artifacts/', label: 'Artifacts' },
  { href: '/about/', label: 'About' },
  { href: '/manifesto/', label: 'Manifesto' },
  { href: '/notes/', label: 'Notes', requires: 'notes' },
  ...(site.resumePath ? [{ href: site.resumePath, label: 'Résumé' }] : []),
  { href: '/contact/', label: 'Contact' },
];
