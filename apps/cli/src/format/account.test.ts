import { expect, test } from 'bun:test'
import type { AccountInventoryItem } from '@ctxindex/core/account'
import { formatAccountInventory } from './account'

const inventory: AccountInventoryItem[] = [
  {
    id: 'account-1',
    provider: 'google',
    label: 'Person\nOne',
    grants: [
      {
        id: 'grant-1',
        scopes: ['mail.read', 'openid'],
        expiresAt: 2000,
        expiryState: 'active',
        sources: [
          {
            id: 'source-1',
            displayName: 'Primary Inbox',
            adapter: { id: 'google.mailbox', version: 1 },
            realm: { id: 'realm-1', slug: 'work', label: 'Work' },
          },
        ],
      },
    ],
  },
  {
    id: 'account-2',
    provider: 'microsoft',
    label: null,
    grants: [
      {
        id: 'grant-2',
        scopes: [],
        expiresAt: null,
        expiryState: 'unknown',
        sources: [],
      },
    ],
  },
]

test('formats compact nested Account, Grant, and Source inventory', () => {
  expect(formatAccountInventory(inventory, false)).toBe(
    [
      'ACCOUNT account-1  provider=google  label="Person\\nOne"',
      '  GRANT grant-1  active  expiresAt=2000',
      '    scopes: mail.read, openid',
      '    SOURCE source-1  name="Primary Inbox"  adapter=google.mailbox@1  realm=work',
      'ACCOUNT account-2  provider=microsoft  label=(unlabeled)',
      '  GRANT grant-2  unknown  expiresAt=-',
      '    scopes: none',
    ].join('\n'),
  )
  expect(formatAccountInventory([], false)).toBe('No Accounts configured.')
})

test('JSON preserves safe nested cardinality without inventing identity or secret fields', () => {
  const output = formatAccountInventory(inventory, true)
  expect(JSON.parse(output)).toEqual(inventory)
  expect(output).not.toContain('externalUserId')
  expect(output).not.toMatch(/token|secret|Ref/)
  expect(formatAccountInventory([], true)).toBe('[]')
})
