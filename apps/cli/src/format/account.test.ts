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

test('formats escaped Account and Source inventory without private Grant state', () => {
  const text = formatAccountInventory(inventory, 'text')
  expect(text).toContain('Person\\nOne')
  expect(text).toContain('primary-inbox')
  expect(text).not.toMatch(/grant|scope|token|secret/i)
})

test('JSON preserves safe nested cardinality without inventing identity or secret fields', () => {
  const output = formatAccountInventory(inventory, 'json')
  expect(JSON.parse(output)).toEqual(inventory)
  expect(output).not.toContain('externalUserId')
  expect(output).not.toMatch(/grant|scope|token|secret|Ref/i)
  expect(formatAccountInventory([], 'json')).toBe('[]')
})

test('account added output exposes only the public Account id', () => {
  expect(formatAccountAdded({ accountId: 'account-1' })).toBe(
    'account added: account-1',
  )
})
