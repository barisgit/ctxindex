## ADDED Requirements

### Requirement: Definition ids have one route-safe grammar
Extension, Provider, Profile, and Adapter ids MUST be at most 128 ASCII characters and consist of lowercase alphanumeric segments separated by a single `.`, `_`, or `-`. Registry validation MUST reject every other id before activation so authored and generated documentation paths use the exact id without lossy encoding or collision.

#### Scenario: Definition id cannot round-trip through a bounded route
- **WHEN** a definition id contains a slash, ill-formed surrogate, uppercase character, repeated separator, or more than 128 characters
- **THEN** the containing Extension is rejected before activation

### Requirement: Acquired Extensions share documentation loading
Trusted built-in, explicit-path TypeScript/JavaScript, existing installed inline, and already-acquired external-package Extensions SHALL resolve and validate documentation through the same Extension loading and atomic registry activation path. The loader MUST bind a directory descriptor to its already-known definition-module URL before registry activation. This change MUST NOT add package acquisition, a Catalog package schema, caller inspection, macros, or a core-supplied Extension factory. A documentation failure MUST reject the Extension whole with a path-scoped diagnostic.

#### Scenario: External loader supplies an acquired package module
- **WHEN** an external loader has already acquired an npm package and supplies its definition-module URL
- **THEN** ctxindex resolves that Extension's relative docs without downloading, installing, or executing package-manager behavior

#### Scenario: Exact selection isolates unselected sibling documentation
- **WHEN** an exact-id loader selects one root from a multi-root package whose unselected sibling has invalid or missing documentation
- **THEN** the loader resolves and validates only the selected root's documentation, while a whole-package multi-root load still validates every collected root

### Requirement: Compiled built-ins embed resolved documentation
The compiled built-in packaging path SHALL resolve directory descriptors while their definition-module URLs and source files are available, validate them through the shared documentation rules, and embed generated virtual trees in the compiled artifact. A relocated compiled CLI MUST NOT need the source checkout or captured module paths to expose the same logical projection.

#### Scenario: Relocated compiled built-in retains documentation
- **WHEN** a compiled CLI is relocated outside the repository
- **THEN** its built-in Extension documentation matches the source projection using embedded strings/bytes only
