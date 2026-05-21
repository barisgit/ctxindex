import { ulid } from 'ulid'

export function newId(): string {
  return ulid()
}

export function newIdAt(ms: number): string {
  return ulid(ms)
}
