# apps/cli/src/artifact/

## Responsibility

Owns the CLI workflow for listing Resource Artifact descriptors and downloading Artifact bytes into the managed cache.

## Design / patterns

- `handle-artifact-command.ts` parses list/download argv before dependency loading, delegates exclusively to `ArtifactService`, formats through `format/artifact.ts`, maps errors, prints list warnings, and closes dependencies.
- An injectable dependency factory keeps focused tests independent of storage and provider I/O.

## Integration points

- Called only by `commands/artifact.ts`.
- Uses the public core Artifact service, `args/artifact.ts`, focused formatters, and shared exit mapping.
