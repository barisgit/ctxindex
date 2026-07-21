## Why

Catalogs currently curate only static metadata. Authors need to curate runnable
Extensions from npm, Git, contained local packages, and literal Extension roots
without making Catalog browsing executable or creating a second installation
system.

The safe boundary is a hybrid: Catalog build is an explicitly trusted authoring
operation that resolves and validates candidates, while Catalog install replays
the exact recorded result through the canonical generic installer. Catalog
refresh, inspection, and Marketplace search remain data-only, and startup uses
only locally managed bytes.

## What Changes

- Add typed, effect-free Catalog authoring helpers for literal and package-backed
  entries. Catalog entries accept only literal Extension objects or package
  descriptors; Catalogs cannot nest.
- Add `ctxindex extensions catalog build`, which imports the author package only
  after an author trust warning, resolves every package target through the
  canonical installer, and writes one deterministic schema-v2 snapshot.
- Record exact npm versions and integrity, Git commits, or contained local
  origins together with a sanitized Bun 1.3.14 lock artifact and expected
  materialization digest. Mutable package requests are never install-time
  authority.
- Record literal entries as an exact locator into the immutable Catalog author
  package: module path, Catalog id, entry index, and Extension id, plus that
  package's lock artifact and materialization digest.
- Extend the canonical installer with two explicit operations:
  `resolveForAuthoring`, which resolves and validates an exact candidate and
  emits replay data, and `installExact`, which reproduces recorded bytes under
  a frozen lock, verifies identity and digest, validates the complete registry,
  and publishes managed bytes.
- Store every installed package-backed Extension in one atomically rewritten
  generic execution record. Catalog-installed records add optional nested
  curation metadata; there are no activation generations, pointer files, or
  retained history.
- Allow automatic replacement only when the installed record is curated by the
  same configured Catalog name and stable Catalog id. Direct installs, another
  Catalog, builtins, and explicit-path Extensions require an explicit uninstall
  before the stable id can be reused.
- Preserve data-only Catalog add/refresh/list/show/search, deterministic
  Marketplace results, separate repository and execution trust, default refresh
  with explicit offline `--no-refresh`, and offline startup.
- Preserve the existing direct-install CLI and route direct and Catalog installs
  through the same materialization, selection, validation, publication, and
  record-writing implementation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `extension-catalogs`: typed authoring, schema-v2 exact replay metadata,
  deterministic Marketplace projection, same-Catalog replacement, and safe
  removal rules.
- `extension-installation`: canonical authoring resolution and exact install
  seams, sanitized Bun lock replay, one atomic generic record, and collision
  policy.
- `extension-loading`: package entry discovery during trusted authoring and
  offline loading exclusively from managed installed bytes.
- `cli-surface`: Catalog build/search/install workflow while retaining explicit
  direct package lifecycle forms and trust boundaries.

## Impact

- SDK: new plain authoring value types and factories.
- Catalog snapshot: pre-alpha schema-v2 entries with exact source provenance,
  bounded replay artifacts, and literal author-package locators.
- Installer: a source-neutral `resolveForAuthoring` / `installExact` split added
  to the existing canonical direct installer.
- State: the generic installed-extension document gains optional Catalog
  curation; no separate Catalog activation state is introduced.
- CLI: a trusted build command and Marketplace search/install behavior; Catalog
  lifecycle and direct lifecycle grammar remain explicit.
- Security: package-manager execution and module import occur only at trusted
  build or install boundaries; refresh, search, and startup never fetch or
  execute Catalog-controlled upstream content.
