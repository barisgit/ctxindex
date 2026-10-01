# apps/cli/src/artifact/

## Responsibility

Owns CLI workflows for listing Resource Artifact descriptors, downloading bytes into the managed cache, and explicitly purging that cache.

## Design / patterns

- `handle-artifact-command.ts` consumes a typed list/download/purge input and validates list/download Refs before route selection. After daemon ensure it invokes `artifact.list|download|purge`; downloads to a file consume the opaque transfer ticket through `daemonTransferToFile`, and a cancellation observed after publication exits as cancelled without a receipt while leaving the complete file. Only the unsupported-platform route opens direct dependencies and delegates to `ArtifactService`.
- List uses the shared pretty/text/json collection contract through `format/artifact.ts`; download and purge retain their operation-specific readable/JSON receipts. All branches map errors and close dependencies, while readable list output preserves warnings.
- An injectable dependency factory keeps focused tests independent of storage and provider I/O.

## Integration points

- Called only by `commands/artifact.ts`.
- Uses `daemon/client.ts`, `daemon/ensure.ts`, the public core Artifact service on the direct route, focused formatters, and shared exit mapping; no command-specific argv parser or top-level purge command remains.
