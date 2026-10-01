## Context

The repository already contains a providerless tenders Extension used by tests to prove the public SDK seam. It has two minimal fixtures and is loaded from an explicitly prepared local path. The direct installer accepts Git packages but does not select a monorepo workspace subdirectory, and the repository is currently private. The launch audience needs one separately publishable official demo that works with a globally installed compiled CLI, creates no provider state, and produces enough deterministic data to demonstrate generic operations.

## Goals / Non-Goals

**Goals:**

- Make the existing tenders example the single polished no-auth demo.
- Provide realistic but unmistakably synthetic records spanning distinct buyers, categories, statuses, values, and dates.
- Make one package artifact installable through the existing direct installer without publishing the SDK first.
- Document and test the exact isolated workflow from initialization through complete retrieval.
- Keep source authoring against the ordinary public SDK while shipping a self-contained runnable package entry.

**Non-Goals:**

- Add Git monorepo-subdirectory target syntax.
- Add a second demo domain, provider, Account, Action, or network operation.
- Turn fixture data into a procurement API or claim compatibility with a real procurement portal.
- Publish packages, push branches, alter user state, or add a special demo command.

## Decisions

### Reuse the tenders domain with explicitly demo-owned identifiers

The example will use demo-namespaced Extension, Adapter, and Profile identifiers and clearly fictional organizations. This avoids implying that the fixtures represent a live national procurement system while retaining a domain that naturally demonstrates full-text search, typed fields, dates, and numeric values. Keeping the old portal-shaped names was rejected because official launch copy would overstate provenance.

### Ship one moderately sized deterministic corpus

The demo will include enough varied complete Resources to support meaningful free-text queries, exact status/category/buyer filtering, numeric value inspection, and retrieval. Static ISO timestamps and stable references make output reproducible. Random generation and current-time-relative dates were rejected because they make screenshots, tests, and agent behavior drift.

### Ship a self-contained Extension package entry

The demo package manifest advertises one checked, generated JavaScript entry. The authored TypeScript continues importing the public SDK; the bundled entry embeds runtime authoring dependencies, so package installation does not depend on an unpublished SDK package. The package can be packed and tested locally now, then published as `@ctxindex/demo-tenders` without changing its runtime graph. Adding a Git subdirectory selector or pretending the private repository is an anonymous launch target was rejected.

### Keep the walkthrough generic and isolated

The documented path uses `extension install npm`, `realm add`, `source add`, `sync`, `search`, and `get`, with temporary `CTXINDEX_*_HOME` state. No demo-only core behavior is introduced. Expected JSON output preserves actual envelopes while placeholders cover generated ULIDs, timestamps, integrity values, and digests.

## Risks / Trade-offs

- [The public install command cannot pass until the package is published] → Treat publication and anonymous acquisition as an explicit launch Human checkpoint and prove the exact packed artifact locally first.
- [A checked bundle can drift from its TypeScript source] → Add a deterministic build-and-compare test and regenerate it only through the package build script.
- [Static procurement dates eventually become historical] → Treat dates as fixture facts and demonstrate status/category filters rather than claiming live availability.
- [Bundling the SDK increases entry size and startup parsing work] → Keep byte-freshness coverage, measure the multi-process registry gate, and allow its integration timeout to cover loaded-host contention without changing runtime semantics.

## Migration Plan

No persistent user state is migrated. This changes a pre-release external example's identifiers; existing local proof Sources using the old Adapter id must be recreated manually if they exist.

## Open Questions

None.
