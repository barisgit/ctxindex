## Capability Implementation Targets

- `docs-web-surface` → `openspec/specs/docs-web-surface/implementation.md`
- `extension-documentation` → `openspec/specs/extension-documentation/implementation.md`

## Module Ownership

The private `apps/web` workspace owns public product presentation, task-oriented navigation, authored MDX guidance, and integration with generated reference content. It projects contracts owned by `CONTEXT.md`, capability specs, the public CLI surface, and the Extension SDK; it does not redefine them.

`packages/extension-sdk` remains the authoring contract. Repository examples own executable source and focused tests that prove published author workflows. The docs link to or render those checked examples rather than creating a second unverified SDK surface. The independent CLI generator owns command pages under the generated reference subtree; product and Extension docs own only orientation and links to that output.

## Interfaces and Data Flow

The existing Fumadocs source loader remains the single documentation index for navigation, rendering, search, generated Markdown/LLM text, source links, and social images. Root metadata orders Start, Use, Extend, Reference, and Contribute; section metadata orders pages inside each intent group. Legacy documents may remain addressable outside the primary tree.

The homepage consumes only semantic design tokens and reusable brand/command components. Its command/result data is static reviewed documentation derived from tested CLI behavior, not runtime user state or a simulated hosted product.

Extension author guides import the supported `@ctxindex/extension-sdk` facade. Their examples flow from ordinary TypeScript definition factories to one or more plain exported Extension roots declared by `package.json` `ctxindex.extensions`. Package managers resolve dependencies before ctxindex's common manifest-entry collector and complete-registry validator run.

## Storage and State

The website stores no user, provider, OAuth App, Catalog, installed-Extension, or search state. Authored MDX, checked example source, and verified documentation assets are repository files. Framework build output and visual captures are generated verification artifacts, not product state.

## Security and Compatibility

Public examples may expose public OAuth App registration metadata such as client IDs, which are identifiers rather than secrets. They must not expose confidential client credentials, tokens, Grant state, secret references, private provider state, or any value whose security depends on confidentiality. Managed OAuth guidance reflects policy-qualified selection and provider-verification caveats; BYOA remains explicit. External Extensions are described as trusted in-process code, with Catalog acquisition and install execution as distinct trust gates.

The CLI remains the only agent integration surface. No website, SDK guide, example, or reference orientation may introduce an MCP server, hosted marketplace, hosted personal-context store, arbitrary Extension command family, or new provider mutation. Existing documentation URLs remain served where practical, but this pre-alpha change creates no compatibility alias requirement.

## Verification

Repository example tests/typecheck prove both providerless and provider-backed authoring, manifest entry discovery, documentation declarations/assets, and public-facade imports. Focused web tests validate navigation/content invariants, required examples, internal links, and absence of stale handwritten-reference prominence. Web lint/typecheck and production build validate MDX compilation and route integration.

Representative desktop and narrow-mobile review covers first-viewport comprehension, overflow, navigation adaptation, readable code, keyboard focus, reduced motion, heading/landmark semantics, and both themes. Cross-cutting gates remain `bun run ci`, `bunx openspec validate --all --strict`, and OpenSpec verification.

## Promotion Notes

- Merge the task-oriented navigation ownership, generated-reference boundary, static product-artifact flow, and representative responsive/accessibility verification doctrine into `openspec/specs/docs-web-surface/implementation.md`.
- Merge the checked-example ownership, ordinary package dependency direction, documentation/assets publication flow, secret-redaction boundary, and Extension authoring verification doctrine into `openspec/specs/extension-documentation/implementation.md`.
