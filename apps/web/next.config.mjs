import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()
const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  turbopack: {
    root: workspaceRoot,
  },
  async redirects() {
    return [
      { source: '/docs/start', destination: '/docs', permanent: true },
      {
        source: '/docs/use/workflows',
        destination: '/docs/use',
        permanent: true,
      },
      {
        source: '/docs/guides/agent-integration',
        destination: '/docs/start/agent-usage',
        permanent: true,
      },
      {
        source: '/docs/guides/mail-workflows',
        destination: '/docs/use/mail',
        permanent: true,
      },
      {
        source: '/docs/guides/calendar-workflows',
        destination: '/docs/use/calendar',
        permanent: true,
      },
      {
        source: '/docs/contribute/development',
        destination: '/docs/contribute',
        permanent: true,
      },
      {
        source: '/docs/contribute/architecture-design',
        destination: '/docs/contribute',
        permanent: true,
      },
    ]
  },
}

export default withMDX(config)
