export type DefinitionVersion = number

export type ProfileReference<
  TId extends string = string,
  TVersion extends number = number,
> = {
  readonly id: TId
  readonly version: TVersion
}
