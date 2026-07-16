export interface TenderFixture {
  readonly reference: string
  readonly title: string
  readonly buyer: string
  readonly publishedAt: string
  readonly deadline: string
  readonly status: string
  readonly description: string
}

export const TENDER_FIXTURES: readonly TenderFixture[] = [
  {
    reference: 'JN-001/2026',
    title: 'Supply of laboratory equipment',
    buyer: 'National Research Institute',
    publishedAt: '2026-01-15T09:00:00.000Z',
    deadline: '2026-02-12T11:00:00.000Z',
    status: 'open',
    description: 'Supply and installation of laboratory analysis equipment.',
  },
  {
    reference: 'JN-002/2026',
    title: 'Municipal bridge inspection',
    buyer: 'Municipality of Triglav',
    publishedAt: '2026-01-20T08:30:00.000Z',
    deadline: '2026-02-20T10:00:00.000Z',
    status: 'open',
    description: 'Structural inspection and reporting for municipal bridges.',
  },
]
