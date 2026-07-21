---
title: Instant demo: synthetic tenders
summary: Try Sync, search, typed fields, and complete retrieval without an account.
order: 1
---
# Instant demo: synthetic tenders

This official demo indexes eight deterministic fictional procurement notices. It needs no Provider, OAuth App, Account, credential, secret, network access, or prepared input file.

All organizations and tender details are synthetic test data produced without network access or scraping. They do not represent, scrape, or imply affiliation with e-JN, eNaročanje, another procurement portal, or current opportunities.

- [Synthetic Tender Profile](profiles/ctxindex.demo.tender@1.md)
- [Synthetic Tender Adapter](adapters/ctxindex.demo.tenders.md)

## Try it

After publication, install the Extension through ctxindex's normal npm acquisition flow:

```sh
ctxindex extension install npm \
  '@ctxindex/demo-tenders@0.1.0' \
  ctxindex.demo
```

The command is an explicit trust grant to run package code. The installer records the exact version and integrity and uses an immutable managed materialization on later starts. Publication and an anonymous install are required launch Human checkpoints.

The package README contains the complete isolated-state walkthrough. After Sync, search by text or any declared field and follow the returned Ref with `ctxindex get`.

## Troubleshooting

- `Extension target acquisition failed`: the package may not be published yet; otherwise confirm network access and Bun 1.3.14, then retry the exact install command.
- `Extension ctxindex.demo is already installed`: use the existing pin. Changing its exact package target requires uninstalling it first, then installing the newer exact version.
- `Unknown Adapter`: confirm `ctxindex extension list` includes `ctxindex.demo` before creating the Source.
- Empty search results: run `ctxindex sync --source demo-tenders` and confirm the run added eight Resources.
