# Getting started with ctxindex

Use ctxindex to discover, retrieve, and materialize personal context across configured Sources, organized into Realms such as `personal`, `company`, and `university`.

Start with the [CLI overview](./reference/cli-overview.md).

## Core workflow

1. Initialize ctxindex.
2. Create a Realm.
3. For an OAuth Adapter, add a provider client from its declared environment values.
4. Authorize the provider Account with that persisted client.
5. Add a Source to that Realm.
6. Search remotely immediately, or sync when the Source supports a local projection.
7. Retrieve complete Resources by their stable `ctx://` Ref.
8. Download Artifacts or export Profile-supported representations when needed.

Discover the provider id and client environment names with `ctxindex describe adapter <adapter-id> --json`, then run `ctxindex client add <provider> --from-env` once and `ctxindex account add <provider>`. The environment is read only by `client add`; authorization resolves the persisted client and never accepts credentials on argv. Client labels default to the provider id and are unique per provider; use `--client <label>` when several exist. Account labels default to the verified provider identity, and Source labels default to `<account-label>-<adapter-tail>` or `<adapter-tail>` without an Account. Account and Source labels are globally unique verbatim handles; collisions exit 2 without prompting or automatic suffixes. Use `client remove <provider> <label>` and `account remove <label>` for explicit cleanup.

An unscoped search spans all configured Accounts and unauthenticated Sources.
Use an explicit Realm filter to keep personal and work retrieval exact. Inspect
`account list` and `source list` rather than inferring provider identity from a
Source label.

## Calendar events

Calendar Sources are indexed: synchronize the selected calendar, search with
the generated event alias, then retrieve complete events by their stable
Source-scoped Ref.
One stable Grant is shared by compatible mailbox and calendar Sources for the
same provider Account and is updated in place on reauthorization. Account labels
cannot overlap globally; identical cross-provider default identities require
distinct explicit `--label` values, and collisions exit 2. Inspect the Adapter
definition for generated configuration flags and exact scopes.

Calendar Adapters are read-only and expose no mutation Actions.

## Email Drafts

The agent may compose proposed text without calling ctxindex. Before persisting a provider Draft, list loaded reversible Actions with `ctxindex describe action`, inspect the applicable definition with `ctxindex describe action <action-id> --json`, and invoke it through an explicit mailbox Source.

V1 does not send email. Sending and other consequential provider mutations are deferred.
