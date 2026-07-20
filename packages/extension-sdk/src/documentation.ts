export interface DocumentationDirectoryDeclaration {
  readonly kind: 'directory'
  readonly path: './docs'
}

export type DocumentationAssetMediaType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/webp'

export type DocumentationFile =
  | {
      readonly path: string
      readonly kind: 'markdown'
      readonly content: string
      readonly mediaType: 'text/markdown'
    }
  | {
      readonly path: string
      readonly kind: 'asset'
      readonly content: Uint8Array
      readonly mediaType: DocumentationAssetMediaType
    }

export interface DocumentationVirtualTreeDeclaration {
  readonly kind: 'virtual'
  readonly index: 'README.md'
  readonly files: readonly DocumentationFile[]
}

export type DocumentationDeclaration =
  | DocumentationDirectoryDeclaration
  | DocumentationVirtualTreeDeclaration

export function docs(path: './docs'): DocumentationDirectoryDeclaration
export function docs(
  tree: Omit<DocumentationVirtualTreeDeclaration, 'kind'>,
): DocumentationVirtualTreeDeclaration
export function docs(
  input: './docs' | Omit<DocumentationVirtualTreeDeclaration, 'kind'>,
): DocumentationDeclaration {
  return input === './docs'
    ? { kind: 'directory', path: input }
    : { ...input, kind: 'virtual' }
}
