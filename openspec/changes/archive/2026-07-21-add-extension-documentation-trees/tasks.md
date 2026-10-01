## 1. Foundation and SDK contract

- [x] 1.1 Verify merged issue #62's stable Provider/Adapter/Extension ids, versioned Profiles, and acquired entry-module provenance; keep issue #59 Catalog/package acquisition out of this change.
- [x] 1.2 Add the pure `docs('./docs')` relative-directory descriptor and eager generated virtual-tree union with no caller introspection, macro, captured URL, host factory, or per-file imports.
- [x] 1.3 Add SDK type/runtime tests proving exactly one declaration form and plain string/byte virtual values.
- [x] 1.4 Slice gate: pass focused SDK tests, typecheck, and lint before resolver work.

## 2. Safe deterministic resolution

- [x] 2.1 Bind directory descriptors to the loader-provided definition-module URL and normalize directory/virtual inputs through one core resolver before registry activation.
- [x] 2.2 Implement the fixed file/depth/byte/path/frontmatter/reference bounds, closed PNG/JPEG/GIF/WebP media detection, HTTPS-only external links, and raw HTML/SVG/unsafe URL rejection.
- [x] 2.3 Implement strict relative containment, no-symlink/special-file policy, duplicate/Unicode-case-fold collision checks, local-reference resolution, and deterministic path-scoped diagnostics.
- [x] 2.4 Add focused tests for every security rule and bound, including directory/virtual parity and future-browser sanitization contract documentation.
- [x] 2.5 Slice gate: pass focused resolver/security tests and core typecheck before registry projection work.

## 3. Versioned registry projection

- [x] 3.1 Add canonical `providers/<id>.md`, `adapters/<id>.md`, and `profiles/<id>@<version>.md` mapping and validate each route against exact loaded definitions.
- [x] 3.2 Add unversioned Profile aliases only for a unique id and multi-version tests proving both exact routes remain while the ambiguous alias is absent.
- [x] 3.3 Build the transport-neutral authored/generated reference projection with stable ordering and no source-location leakage.
- [x] 3.4 Add registry tests for atomic failure, generated-truth separation, exact id/version binding, alias determinism, and no object-identity dependency.
- [x] 3.5 Slice gate: pass focused registry, loader, and exact-selection package-entry tests before distribution work.

## 4. Distribution paths

- [x] 4.1 Cover raw TypeScript/JavaScript and already-acquired npm package fixtures through the same loader URL-binding path without adding acquisition behavior.
- [x] 4.2 Resolve built-in directory declarations during package/build staging and embed validated virtual trees in the compiled Bun artifact.
- [x] 4.3 Add relocation tests comparing raw/package/built-in logical projections outside the checkout and architecture tests forbidding Catalog schema/acquisition changes.
- [x] 4.4 Refresh affected codemaps and authoring examples after structural implementation.
- [x] 4.5 Slice gate: pass built-in freshness, external-package, compiled relocation, and architecture checks.

## 5. Verification

- [x] 5.1 Run all focused task gates with isolated state and resolve every failure.
- [x] 5.2 Run the final repository gate `bun run ci`.
- [x] 5.3 Run `bunx openspec validate --all --strict` and resolve every finding.
- [x] 5.4 Run `openspec-verify-change` for `add-extension-documentation-trees` before archive and resolve every critical or warning finding.
