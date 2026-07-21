# apps/cli/src/artifact/

## Responsibility

Owns CLI workflows for listing Resource Artifact descriptors, downloading bytes into the managed cache, and explicitly purging that cache.

## Design / patterns

- `handle-artifact-command.ts` consumes a typed list/download/purge input, validates list/download Refs before dependency loading, and delegates exclusively to `ArtifactService`.
- List and download use `format/artifact.ts`; purge emits deterministic byte/object accounting. All branches map errors and close dependencies, while readable list output preserves warnings.
- An injectable dependency factory keeps focused tests independent of storage and provider I/O.

## Integration points

- Called only by `commands/artifact.ts`.
- Uses the public core Artifact service, focused formatters, and shared exit mapping; no command-specific argv parser or top-level purge command remains.
