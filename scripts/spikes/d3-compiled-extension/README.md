# D3 spike: compiled binary loading an external TypeScript extension

Decision D3 retains the compiled Bun binary while loading trusted user extensions
at runtime. This spike proves the load boundary that the design depends on.

`run.sh`:

1. compiles `host.ts` with `bun build --compile`;
2. relocates the resulting executable and runs it from `/`;
3. dynamically imports an external `extension.ts` through a `file:` URL;
4. exercises TypeScript-only syntax and a type-only authoring import;
5. loads a relative TypeScript helper and an extension-owned `node_modules`
   dependency; and
6. calls the factory with a host-provided API object and asserts the result.

Run from the repository root:

```sh
./scripts/spikes/d3-compiled-extension/run.sh
```

Version matrix observed on 2026-07-13:

- Bun 1.3.12: failed while the compiled executable imported the external
  extension (process killed with exit 137).
- Bun 1.3.13: passed.
- Bun 1.3.14: passed.

The project toolchain is therefore pinned to Bun 1.3.14. This script is
retained as the regression check for the extension loader implementation.
