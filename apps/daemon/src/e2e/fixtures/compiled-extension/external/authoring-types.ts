export interface HostApi {
  version: string
  defineAdapter<T extends { id: string }>(definition: T): T
}
