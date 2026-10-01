# Docs Web Surface Specification

## Purpose
Define the public product homepage and task-oriented documentation experience, including onboarding boundaries and representative quality verification.
## Requirements
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

### Requirement: Canonical public metadata
The documentation web surface MUST derive canonical and social metadata URLs from one configurable, absolute public origin and MUST omit origin-dependent metadata when no public origin is configured.

#### Scenario: Deployment supplies a canonical origin
- **WHEN** the site is built with a valid configured public origin
- **THEN** page metadata and generated absolute URLs use that normalized origin

#### Scenario: Deployment omits the canonical origin
- **WHEN** the site is built without an origin override
- **THEN** it omits origin-dependent metadata rather than publishing a localhost or request-derived URL

### Requirement: Exact generated representation routes
Generated documentation representations MUST resolve only when the request ends with the representation's exact documented filename and MUST return not found for missing, substituted, or extra terminal segments.

#### Scenario: Markdown representation uses the exact suffix
- **WHEN** a request names an existing documentation page followed by `content.md`
- **THEN** the server returns that page's Markdown representation

#### Scenario: Markdown representation is malformed
- **WHEN** a request for a documentation representation omits `content.md`, substitutes another terminal segment, or appends a segment after it
- **THEN** the server returns not found

#### Scenario: Page image uses the exact suffix
- **WHEN** a request names an existing documentation page followed by `image.png`
- **THEN** the server returns that page's generated image

#### Scenario: Page image route is malformed
- **WHEN** a page-image request omits `image.png`, substitutes another terminal segment, or appends a segment after it
- **THEN** the server returns not found

### Requirement: Repository source links
Each rendered documentation page MUST link to its actual source file under `apps/web/content/docs/` on the configured repository branch.

#### Scenario: Reader opens a source link
- **WHEN** a reader chooses the repository source option on a documentation page
- **THEN** the link targets that page's MDX source beneath `apps/web/content/docs/`

### Requirement: Accurate runtime and product boundary
The web app documentation MUST state that documentation pages are prerendered while search requires a compatible Next.js server or serverless runtime, and MUST NOT present ctxindex as operating a hosted marketplace.

#### Scenario: Operator reviews deployment requirements
- **WHEN** an operator reads the web app deployment documentation
- **THEN** it identifies the supported server or serverless runtime and does not claim deployment to a static file host

#### Scenario: User reviews marketplace guidance
- **WHEN** a user reads marketplace examples
- **THEN** the site describes the merged local Git Catalog, its add and install trust gates, default refresh and `--no-refresh`, and install and uninstall commands without claiming a hosted marketplace

### Requirement: CLI examples match the current interface
Commands, identifiers, input objects, and JSON result shapes published by the web surface MUST be accepted by or accurately project the current generated CLI interface and capability contracts.

#### Scenario: Reader follows a landing or terminal example
- **WHEN** a reader copies a command from the landing page or terminal example
- **THEN** the command uses a current CLI verb and flags, syntactically valid Ref or ULID placeholders, and the documented output uses the current envelope shape

#### Scenario: Reader follows a threaded Draft workflow
- **WHEN** a reader follows the threaded reply guide
- **THEN** the guide first obtains a complete local parent and creates a Draft with `{replyToRef, bodyText}`

#### Scenario: Reader updates a Draft
- **WHEN** a reader follows the Draft update guide
- **THEN** the guide identifies immutable update prerequisites and supplies the complete replacement input required by the current Action schema

#### Scenario: Reader requests describe JSON
- **WHEN** a reader compares bare `describe --format json` with `describe --full --format json`
- **THEN** the site identifies the bare form as compact and the full form as the complete registry snapshot

### Requirement: Web dependency verification
Repository dependency verification MUST inspect the web workspace, ignore generated build directories and local path aliases, account only for explicitly recognized framework or peer imports, and report ordinary undeclared, unused, or forbidden dependencies.

#### Scenario: Web app imports an undeclared package
- **WHEN** a web source file imports an ordinary external package absent from its runtime dependencies
- **THEN** the dependency verifier reports an undeclared-dependency violation for `web`

#### Scenario: Web app uses generated and framework imports
- **WHEN** the web app contains ignored generated output, configured local aliases, or recognized framework-provided type/runtime imports
- **THEN** those imports do not create false dependency violations
