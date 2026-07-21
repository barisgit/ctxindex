## Context

The current web app already has a coherent ctxindex token system, brand assets, a Fumadocs renderer, generated text representations, and accurate source links. Its homepage nevertheless leads with a broad claim and a synthetic search result, then repeats conceptual feature grids before offering a practical route. Its navigation groups content by implementation category (`concepts`, `cli`, `guides`, `examples`) rather than the reader's current task, and the Extension SDK contract is distributed across source, tests, OpenSpec, and a single external fixture.

Issue #81 requires a fast product explanation, successful local onboarding, clear trust boundaries, a task-oriented information architecture, and comprehensive Extension author guidance. The CLI-reference generator is being developed independently, so this change must integrate that surface without taking ownership of individual command pages.

## Goals / Non-Goals

**Goals:**

- Make the first viewport explain the product and prove one concrete agent command/result workflow.
- Give a new user an account-free path from installation to a useful result, then separate optional provider authorization and agent integration.
- Organize documentation under Start, Use, Extend, Reference, and Contribute.
- Teach the exact accepted Extension graph with copyable, mechanically checked providerless and provider-backed examples.
- Explain documentation trees, assets, package entries, direct installation, Catalog curation, testing, and publishing without inventing an Extension dependency resolver.
- Preserve the established brand system, responsive docs shell, generated representations, and source links.

**Non-Goals:**

- Changing Extension factories, loading, identity, conflict, installation, or Catalog behavior.
- Replacing Fumadocs, introducing a hosted Marketplace, or adding user/provider state to the site.
- Hand-authoring the generated CLI reference or changing CLI behavior.
- Claiming managed OAuth verification or availability beyond current repository evidence.
- Adding decorative imagery, gradients, or a parallel visual language.

## Decisions

1. **The first screen is a compact proof, not a concept inventory.** The hero will pair one exact statement with a real install/search/result artifact and direct Start/Extend routes. Broad feature tiles are replaced by a short workflow spine showing where ctxindex sits between an agent and existing Sources.

2. **A providerless directory is the default first success.** It requires no OAuth portal, credentials, provider approval, or network access and already has deterministic repository-tested commands and output. Google and Microsoft authorization remain separate optional Start guidance with managed-App caveats and explicit BYOA fallback.

3. **Navigation follows reader intent.** Start owns installation and first success; Use owns product workflows and concepts in action; Extend owns the SDK authoring graph; Reference owns generated command and stable contract lookup; Contribute owns repository development and design participation. Existing URLs remain reachable where practical but leave the primary tree.

4. **Extension examples are repository artifacts first and prose second.** A providerless example uses the existing tested tenders package. A compact provider-backed example is kept in repository source with a compile-time or focused test gate, then embedded or mirrored into the guide. This avoids publishing pseudo-code that silently drifts from the SDK.

5. **The graph is explained through exact imports.** Adapters import Provider/Profile values directly. Package managers resolve npm, Git, and local dependencies before ctxindex loads the package; ctxindex does not resolve an Extension dependency graph and no textual leaf refs are introduced.

6. **CLI reference stays generated and secondary.** The new Reference landing owns orientation and links into the generated command tree. This change does not edit or duplicate generated command pages, allowing the independent generator to replace the current handwritten directory cleanly.

7. **Visual verification uses established product evidence.** Semantic tokens, the canonical lockup, JetBrains Mono command artifacts, hairline structure, and rare amber remain. Layout changes are verified at representative desktop and narrow mobile widths, keyboard focus, reduced motion, heading/landmark semantics, and contrast-sensitive states.

## Risks / Trade-offs

- [Primary navigation changes can strand old inbound links] → Keep prior documents served but unlisted where moves would create unnecessary breakage; link the new hierarchy to the strongest existing material until content is fully consolidated.
- [Published examples can drift from implementation] → Source them from repository files covered by package tests/typecheck and validate copied snippets against those files.
- [OAuth onboarding can imply zero-config support that provider policy does not guarantee] → State the managed-App selection conditions and explicit BYOA fallback without exposing app config or secrets.
- [The independent CLI generator may change file ownership late] → Limit this change to the Reference landing and root navigation; do not edit `content/docs/cli/**`.
- [Large documentation growth can become repetitive] → Use one canonical page per concern, cross-link exact prerequisite material, and keep definitions in `CONTEXT.md` rather than restating them everywhere.

## Migration Plan

No persistent or provider state changes. Deploy the updated web bundle normally. Existing documentation routes remain served where practical while the primary navigation changes to the task-oriented hierarchy. Generated CLI reference integration can replace the current command subtree independently.

## Open Questions

None.
