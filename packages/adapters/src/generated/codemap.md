# packages/adapters/src/generated/

## Responsibility

Contains generated portable values required by built-in Extension runtime distribution.

## Design and flow

`documentation.ts` embeds validated virtual Markdown/image trees. The generation script is the writer; built-in Extension roots are the runtime readers. Compiled binaries therefore retain documentation without source checkout paths.
