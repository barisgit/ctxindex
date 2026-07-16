import { afterEach, expect, test } from 'bun:test'
import { assertEgressAllowed } from './index'

const original = process.env.NODE_ENV
afterEach(() => {
  if (original === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = original
})

test('allows only caller-declared production hosts', () => {
  expect(() =>
    assertEgressAllowed('https://provider.example/token', ['provider.example']),
  ).not.toThrow()
  expect(() =>
    assertEgressAllowed('https://other.example/token', ['provider.example']),
  ).toThrow()
  expect(() =>
    assertEgressAllowed('http://provider.example/token', ['provider.example']),
  ).toThrow()
  expect(() =>
    assertEgressAllowed('https://user:secret@provider.example/token', [
      'provider.example',
    ]),
  ).toThrow()
})

test('allows loopback mocks only outside production', () => {
  process.env.NODE_ENV = 'test'
  expect(() => assertEgressAllowed('http://127.0.0.1:43123/mock')).not.toThrow()
  process.env.NODE_ENV = 'production'
  expect(() => assertEgressAllowed('http://127.0.0.1:43123/mock')).toThrow()
})

test('denial is a typed non-network policy failure', () => {
  try {
    assertEgressAllowed('https://evil.example.test/steal')
  } catch (error) {
    expect(error).toMatchObject({ code: 'egress_denied' })
    return
  }
  throw new Error('expected egress denial')
})
