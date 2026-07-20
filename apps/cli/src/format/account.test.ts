import { expect, test } from 'bun:test'
import type { AccountInventoryItem } from '@ctxindex/core/account'
import { formatAccountAdded, formatAccountInventory } from './account'

const inventory: AccountInventoryItem[] = [
  {
    id: 'account-1',
    provider: 'google',
    label: 'Person\nOne',
    expiresAt: 2000,
    expiryState: 'active',
    sources: [
      {
        id: 'source-1',
        label: 'primary-inbox',
        adapter: { id: 'google.mailbox' },
        realm: { id: 'realm-1', slug: 'work', label: 'Work' },
      },
    ],
  },
  {
    id: 'account-2',
    provider: 'microsoft',
    label: null,
    expiresAt: null,
    expiryState: 'unknown',
    sources: [],
  },
]

test('formats compact Account and Source inventory without private Grant state', () => {
  expect(formatAccountInventory(inventory, false)).toBe(
    [
      'ACCOUNT account-1  provider=google  label="Person\\nOne"',
      '  AUTH active  expiresAt=2000',
      '  SOURCE source-1  label="primary-inbox"  adapter=google.mailbox  realm=work',
      'ACCOUNT account-2  provider=microsoft  label=(unlabeled)',
      '  AUTH unknown  expiresAt=-',
    ].join('\n'),
  )
  expect(formatAccountInventory([], false)).toBe('No Accounts configured.')
})

test('JSON preserves safe nested cardinality without inventing identity or secret fields', () => {
  const output = formatAccountInventory(inventory, true)
  expect(JSON.parse(output)).toEqual(inventory)
  expect(output).not.toContain('externalUserId')
  expect(output).not.toMatch(/grant|scope|token|secret|Ref/i)
  expect(formatAccountInventory([], true)).toBe('[]')
})

test('account added output exposes only the public Account id', () => {
  expect(formatAccountAdded({ accountId: 'account-1' })).toBe(
    'account added: account-1',
  )
})
