# Synthetic Tender Adapter

`ctxindex.demo.tenders` is an indexed, providerless, sync-only Adapter backed by immutable fixtures in the Extension package.

It accepts no configuration. Sync emits eight complete `ctxindex.demo.tender@1` Resources and one checkpoint in stable reference order. It never uses the injected network effect, performs no scraping, and defines no remote search, retrieval, download, or Action capability.

Create a Source in an explicit Realm:

```sh
ctxindex source add ctxindex.demo.tenders --realm demo --label demo-tenders
ctxindex sync --source demo-tenders
```

After Sync, all search and retrieval operations are served from ctxindex's local materialization through the same generic operations used by provider-backed Sources.
