## ADDED Requirements

### Requirement: Product-first first viewport
The public homepage MUST explain within its first viewport that ctxindex gives shell-capable agents one local typed interface over mail, calendars, files, and Extension-defined context. The same viewport MUST contain a concrete accepted command and representative result together with a direct installation or first-success path.

#### Scenario: New visitor evaluates ctxindex
- **WHEN** a visitor opens the public homepage on a representative desktop or mobile viewport
- **THEN** the product boundary, agent integration model, concrete command/result, and next onboarding action are available without traversing a generic feature grid

### Requirement: Task-oriented documentation hierarchy
The primary documentation navigation MUST separate Start, Use, Extend, Reference, and Contribute concerns. Usage-oriented onboarding and workflows MUST precede generated reference content in navigation prominence.

#### Scenario: Reader enters with a task
- **WHEN** a reader opens documentation navigation
- **THEN** they can select Start, Use, Extend, Reference, or Contribute without first knowing the repository's package or command organization

#### Scenario: Reader needs exact command syntax
- **WHEN** a reader chooses CLI reference
- **THEN** the site routes them to the generated reference surface without presenting handwritten command pages as the primary onboarding path

### Requirement: Complete onboarding paths and boundaries
Public guidance MUST provide an account-free first-success path, optional provider authorization guidance, shell-agent usage, actionable troubleshooting, and the relevant local-state, provider-canonical, Extension-trust, and OAuth-App boundaries.

#### Scenario: Fresh machine reaches first success
- **WHEN** a reader follows the default Start path without an existing provider Account or OAuth App
- **THEN** they can initialize ctxindex, configure a providerless local Source, materialize it, and obtain a useful result

#### Scenario: Reader chooses provider authorization
- **WHEN** a reader follows Google or Microsoft authorization guidance
- **THEN** the site distinguishes policy-qualified managed OAuth Apps from explicit local BYOA and does not claim universal provider approval or expose App configuration

### Requirement: Representative web quality verification
The product and documentation surfaces MUST pass production build and content/link validation and MUST be reviewed at representative desktop and narrow mobile widths for responsive layout, readable command artifacts, semantic landmarks/headings, keyboard-visible focus, reduced-motion behavior, and accessible color use.

#### Scenario: Product documentation change is prepared for review
- **WHEN** the web content or homepage changes materially
- **THEN** focused automation and recorded visual/accessibility inspection cover both a desktop and narrow mobile presentation before the change is declared complete
