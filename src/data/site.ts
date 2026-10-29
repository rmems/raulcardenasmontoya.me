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
  /** Handle for twitter:site and twitter:creator; the profile URL lives in `social.x`. */
  xHandle: '@KeepOnSpiking',
  resumePath: '/resume.pdf',
} as const;

export interface FooterLink {
  label: string;
  href: string;
  /** Spoken name; defaults to the label, plus "(opens in new tab)" for external links. */
  ariaLabel?: string;
  external?: boolean;
}

// Footer order: contact, then code and research, then social. A new profile is
// one line here; the layout holds no URLs.
export const footerLinks: readonly FooterLink[] = [
  { label: site.email, href: `mailto:${site.email}` },
  ...(site.resumePath ? [{ label: 'Résumé (PDF)', href: site.resumePath }] : []),
  { label: 'GitHub', href: site.social.github, external: true },
  { label: 'Hugging Face', href: site.social.huggingface, external: true },
  { label: 'crates.io', href: site.social.cratesio, external: true },
  { label: 'X', href: site.social.x, external: true, ariaLabel: 'Raul on X (opens in new tab)' },
  { label: 'LinkedIn', href: site.social.linkedin, external: true, ariaLabel: 'Raul on LinkedIn (opens in new tab)' },
  { label: 'Instagram', href: site.social.instagram, external: true, ariaLabel: 'Raul on Instagram (opens in new tab)' },
  { label: 'Threads', href: site.social.threads, external: true, ariaLabel: 'Raul on Threads (opens in new tab)' },
];

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
