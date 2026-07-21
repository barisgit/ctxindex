# Extension Documentation Trees Implementation Doctrine

> This sidecar records intended implementation doctrine. Normative behavior is owned by the delta specs in this change.

## Ownership and dependency order

Merged issue #62 owns plain imported Provider/Adapter/Extension definitions and the package-entry collector's acquired entry-module provenance. Providers, Adapters, and Extensions use stable ids; Profiles use `(id, version)`. Issue #59 exclusively owns package-backed Catalog schemas and acquisition. This change consumes an already-acquired module and neither changes Catalogs nor installs packages.

`@ctxindex/extension-sdk` owns plain documentation declarations and `docs()`. `@ctxindex/core` owns module-URL binding, filesystem/virtual-tree validation, normalized storage in the loaded registry, and transport-neutral projection. Package/build staging owns pre-resolving built-in directories into embedded virtual trees. No CLI or local-web consumer is implemented here.

## SDK interfaces

```ts
export interface DocumentationDirectoryDeclaration {
  readonly kind: 'directory'
  readonly path: './docs'
}

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
      readonly mediaType:
        | 'image/png'
        | 'image/jpeg'
        | 'image/gif'
        | 'image/webp'
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
```

`docs('./docs')` is an ordinary pure function returning a descriptor. It does not read, introspect, capture, transform, or invoke a macro. The public descriptor has no entrypoint/module URL. `ExtensionDefinition.docs` accepts exactly one union member, making directory plus virtual declarations unrepresentable in normal typed code and rejectable at runtime for untyped input.

## Loader provenance and distribution

Extend the #62 import seam to retain the already-known `definitionModuleUrl` beside each candidate Extension until validation. Core resolves a directory descriptor with `new URL(declaration.path + '/', definitionModuleUrl)` only after confirming the module uses a local acquired-file URL. Resolution never uses `cwd`, package/Catalog roots, executable location, or a caller-derived value. Diagnostics expose safe logical paths, not npm cache or user filesystem paths.

Raw explicit TS/JS and an already-acquired npm package use that same seam. Whole-package loads resolve documentation for every collected root. Exact-id imports first collect and select the unique requested root, then resolve only that root's documentation, so an unselected sibling cannot block activation through its own missing or invalid sidecar. This change performs no acquisition. Existing Catalog inline loading may supply its already-acquired module URL without changing its manifest. For built-ins, the release/build staging step loads definitions while source module URLs exist, runs the same resolver/validator, and emits virtual trees into a generated bundled module keyed by exact Extension identity. The compiled runtime registers those virtual values and needs no checkout files.

## Conventional routes and projection

The registry first constrains Extension, Provider, Profile, and Adapter ids to at most 128 lowercase ASCII characters composed of alphanumeric segments separated by one `.`, `_`, or `-`. The resolver recognizes `README.md`, canonical `providers/<id>.md`, `adapters/<id>.md`, `profiles/<id>@<version>.md`, `guides/*.md`, and `assets/**`. It validates canonical identity routes against definitions owned by the Extension. Exact routes use the id without encoding and are sorted by Unicode code-point order.

After all Extensions activate, projection computes unversioned aliases only for Profile ids. It emits an alias only when exactly one loaded canonical Profile document has that ID. With multiple loaded Profile versions, no alias is emitted. Alias computation routes to an exact `(id, version)` target and never compares object identity.

Authored files and generated metadata are separate projection entries. Generated entries derive from loaded Provider, Adapter, and Profile definitions plus their schemas, capabilities, and Actions via existing JSON-schema and ordering utilities. Projection types include Extension identity, optional definition identity, canonical path, origin, content kind, media type, and content; they contain no physical location.

## Resolver security policy

Put fixed limits and passive-media rules in one core policy consumed by both directory and virtual inputs:

- at most 256 files and depth 8;
- at most 8 MiB total decoded content;
- at most 256 KiB per UTF-8 Markdown file;
- at most 16 KiB YAML frontmatter with only `title`, `summary`, `order`;
- at most 2 MiB per asset;
- at most 512 UTF-8 bytes per logical path;
- at most 512 links/assets per Markdown file and 4,096 for the tree;
- assets only byte-verified PNG, JPEG, GIF, or WebP;
- external links only absolute HTTPS; remote images forbidden.

Use `lstat`/`realpath` containment checks and reject every symlink, special file, duplicate, Unicode-case-fold collision, absolute/backslash/NUL/empty/dot/parent path, and over-depth path. Decode Markdown with fatal UTF-8. Parse frontmatter with a closed schema. Parse CommonMark destinations and reject raw/inline HTML, HTML comments, SVG, protocol-relative URLs, every non-HTTPS scheme, unresolved local references, and path escapes. Fragment-only targets remain local. No URL is fetched.

Virtual bytes pass through identical magic-byte media detection and all logical validation. Directory traversal reads only after bounds checks where possible and stops on the first deterministic code-point-sorted error. Failure rejects the whole Extension before registry mutation.

## Consumer boundary

Core exposes the immutable deterministic documentation projection through a provider-neutral query/service interface. It is suitable for a later CLI/agent formatter or browser transport, but this change adds neither. The interface documentation states that any future browser renderer must sanitize Markdown again, disable raw HTML and event/script attributes, allow only safe link schemes, and prevent network-loaded media. The core projection is data, never trusted HTML.

## Verification doctrine

SDK tests prove descriptor purity and the closed directory/virtual union. Resolver tests cover every fixed limit, media magic, frontmatter field, HTML/SVG/URL rejection, symlinks/special files, normalization/case-fold collision, local link containment, and directory/virtual parity. Registry tests prove authored/generated separation, exact version routes, unique aliases, multi-version alias absence, and no object-identity binding. Loader tests cover raw TS, already-acquired package fixtures, and existing inline acquisition without changing Catalog behavior. Build/relocation tests compare built-in source projections to compiled embedded virtual trees. Architecture tests forbid Catalog/package acquisition and consumer-specific dependencies in this change. Finish with focused tests, `bun run ci`, and strict OpenSpec validation.
