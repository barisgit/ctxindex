# Getting started with ctxindex

Use ctxindex to discover, retrieve, and materialize personal context across configured Sources, organized into Realms such as `personal`, `company`, and `university`.

Start with the [CLI overview](./reference/cli-overview.md).

## Core workflow

1. Initialize ctxindex.
2. Create a Realm.
3. Configure authentication when the Adapter requires it.
4. Add a Source to that Realm.
5. Search remotely immediately, or sync when the Source supports a local projection.
6. Retrieve complete Resources by their stable `ctx://` Ref.
7. Download Artifacts or export Profile-supported representations when needed.

## Email Drafts

The agent may compose proposed text without calling ctxindex. Before persisting a provider Draft, list loaded reversible Actions with `ctxindex describe action`, inspect the applicable definition with `ctxindex describe action <action-id> --json`, and invoke it through an explicit mailbox Source.

V1 does not send email. Sending and other consequential provider mutations are deferred.
