export type CompanyBranding = {
  name: string
  slug: string
  primaryColor: string
  secondaryColor: string
  bgColor: string
  textOnPrimary: string
  agentName: string
  tagline: string
  logoInitials: string
  logoUrl: string
}

export const COMPANY_BRANDING: Record<string, CompanyBranding> = {
  'colegio-montano': {
    name: 'Colegio Montano',
    slug: 'colegio-montano',
    primaryColor: '#0067A9',
    secondaryColor: '#FED809',
    bgColor: '#043851',
    textOnPrimary: '#FFFFFF',
    agentName: 'Monti',
    tagline: '¡Formando líderes para el futuro!',
    logoInitials: 'CM',
    logoUrl: '/logo-cm.jpg',
  },
  'mac': {
    name: 'MAC Guatemala',
    slug: 'mac',
    primaryColor: '#C9A84C',
    secondaryColor: '#E8C547',
    bgColor: '#1A1A2E',
    textOnPrimary: '#C9A84C',
    agentName: 'Agente MAC',
    tagline: 'Maximizando resultados con excelencia',
    logoInitials: 'MAC',
    logoUrl: '/logo-mac.jpg',
  },
  'vitanova': {
    name: 'Vitanova',
    slug: 'vitanova',
    primaryColor: '#0055B8',
    secondaryColor: '#2ED9C3',
    bgColor: '#0055B8',
    textOnPrimary: '#FFFFFF',
    agentName: 'Agente Vitanova',
    tagline: 'Nutritivo · Natural · Auténtico',
    logoInitials: 'VN',
    logoUrl: '/logo-vitanova.jpg',
  },
}

export function getBranding(slug: string): CompanyBranding {
  return COMPANY_BRANDING[slug] || COMPANY_BRANDING['colegio-montano']
}
