import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'
import { BrandLockup } from '@/components/brand-lockup'
import { gitConfig } from './shared'

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <BrandLockup variant="navigation" />,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  }
}
