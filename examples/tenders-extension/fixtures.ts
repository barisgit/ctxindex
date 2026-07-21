export interface TenderFixture {
  readonly reference: string
  readonly title: string
  readonly buyer: string
  readonly publishedAt: string
  readonly deadline: string
  readonly status: 'open' | 'planned' | 'awarded' | 'cancelled'
  readonly category: string
  readonly currency: 'EUR'
  readonly estimatedValue: number
  readonly description: string
}

export const TENDER_FIXTURES: readonly TenderFixture[] = [
  {
    reference: 'DEMO-2026-001',
    title: 'Cybersecurity incident response retainer',
    buyer: 'Alpine Example Digital Agency',
    publishedAt: '2026-07-06T08:00:00.000Z',
    deadline: '2026-08-14T10:00:00.000Z',
    status: 'open',
    category: 'cybersecurity services',
    currency: 'EUR',
    estimatedValue: 480000,
    description:
      'Three-year incident response retainer covering 24/7 triage, threat hunting, forensic analysis, and annual tabletop exercises.',
  },
  {
    reference: 'DEMO-2026-002',
    title: 'Rooftop solar arrays for twelve schools',
    buyer: 'Riverbend Example City Council',
    publishedAt: '2026-07-09T09:30:00.000Z',
    deadline: '2026-08-28T11:00:00.000Z',
    status: 'open',
    category: 'renewable energy',
    currency: 'EUR',
    estimatedValue: 1850000,
    description:
      'Design, installation, grid connection, and five-year maintenance of photovoltaic systems across twelve fictional public schools.',
  },
  {
    reference: 'DEMO-2026-003',
    title: 'Mobile diagnostic imaging unit',
    buyer: 'Northstar Example Health Trust',
    publishedAt: '2026-06-18T07:45:00.000Z',
    deadline: '2026-07-17T10:00:00.000Z',
    status: 'awarded',
    category: 'medical equipment',
    currency: 'EUR',
    estimatedValue: 2400000,
    description:
      'Supply of a mobile MRI unit with accessibility lift, operator training, preventive maintenance, and secure image transfer.',
  },
  {
    reference: 'DEMO-2026-004',
    title: 'Digitization of the regional film archive',
    buyer: 'Meridian Example Cultural Foundation',
    publishedAt: '2026-07-15T12:00:00.000Z',
    deadline: '2026-10-02T12:00:00.000Z',
    status: 'planned',
    category: 'digital preservation',
    currency: 'EUR',
    estimatedValue: 760000,
    description:
      'Planned conservation scanning, metadata enrichment, transcription, and redundant archival storage for a fictional film collection.',
  },
  {
    reference: 'DEMO-2026-005',
    title: 'Low-emission buses and depot charging',
    buyer: 'Greenfield Example Transit Authority',
    publishedAt: '2026-07-20T06:30:00.000Z',
    deadline: '2026-09-11T09:00:00.000Z',
    status: 'open',
    category: 'public transport',
    currency: 'EUR',
    estimatedValue: 12800000,
    description:
      'Purchase of eighteen battery-electric buses, overnight depot chargers, fleet telemetry, spare parts, and driver training.',
  },
  {
    reference: 'DEMO-2026-006',
    title: 'Wireless structural monitoring for river bridges',
    buyer: 'Stonebridge Example Infrastructure Agency',
    publishedAt: '2026-05-25T08:15:00.000Z',
    deadline: '2026-07-01T10:00:00.000Z',
    status: 'cancelled',
    category: 'civil engineering',
    currency: 'EUR',
    estimatedValue: 980000,
    description:
      'Cancelled pilot for solar-powered vibration, strain, and temperature sensors with a bridge condition analytics dashboard.',
  },
  {
    reference: 'DEMO-2026-007',
    title: 'Seasonal school meals framework',
    buyer: 'Lakeside Example Education Consortium',
    publishedAt: '2026-07-02T10:20:00.000Z',
    deadline: '2026-08-07T10:00:00.000Z',
    status: 'open',
    category: 'food services',
    currency: 'EUR',
    estimatedValue: 3200000,
    description:
      'Four-year meal service framework emphasizing seasonal menus, allergen controls, reusable packaging, and measured food-waste reduction.',
  },
  {
    reference: 'DEMO-2026-008',
    title: 'Campus heating and ventilation efficiency upgrade',
    buyer: 'Pinecrest Example University',
    publishedAt: '2026-06-11T11:10:00.000Z',
    deadline: '2026-07-10T11:00:00.000Z',
    status: 'awarded',
    category: 'facilities management',
    currency: 'EUR',
    estimatedValue: 1150000,
    description:
      'Controls modernization, heat-recovery ventilation, hydraulic balancing, commissioning, and energy-performance verification.',
  },
]
