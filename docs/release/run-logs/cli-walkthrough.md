```bash
$ ctxindex --version
0.0.0
[exit] 0
```

```bash
$ ctxindex --help
ctxindex

Usage:
  ctxindex <command> [options]

Commands:
  init
  auth add <provider> [--from-env | --client-id <id> --client-secret <secret> [--auth-code <code> | --loopback]]
  auth list [--json]
  realm add <slug>
  realm list [--json]
  source add [<adapter-id>] [--adapter <adapter-id>] [--realm <slug>] [--root <path>] [--config-json <json>]
  source list [--realm <slug>] [--json]
  source remove <source-id>
  sync [--source <id>] [--mode sync|resync|diff]
  search <query> [--realm ...] [--source ...] [--adapter ...] [--kind ...] [--since ...] [--until ...] [--include-deleted] [--explain] [--json]
  status [--source <id>] [--json]
  secrets migrate <backend>
  skills list | get <name> [--inline] | path

Use 'ctxindex <command> --help' for command-specific options.

[exit] 0
```

```bash
$ ctxindex init
ctxindex initialized
[exit] 0
```

```bash
$ ctxindex realm add personal
realm added: personal
[exit] 0
```

```bash
$ ctxindex realm list
global (default)
personal
[exit] 0
```

```bash
$ ctxindex source add local.directory --realm personal --root /var/folders/jy/098pldf54rj47nxsdhy7p1100000gn/T/tmp.0WuDrUh5J2
source added: 01KS7ZA8GCNG2T7ANNV577J5JF
[exit] 0
```

```bash
$ ctxindex source list
01KS7ZA8GCNG2T7ANNV577J5JF	local.directory
[exit] 0
```

```bash
$ ctxindex sync
sync completed: 01KS7ZA8GCNG2T7ANNV577J5JF	run=01KS7ZA8PRX41643QXWM0Q6HXS	items_added=3	items_updated=0	chunks=131	errors=0
[exit] 0
```

```bash
$ ctxindex status --json
[
  {
    "sourceId": "01KS7ZA8GCNG2T7ANNV577J5JF",
    "adapterId": "local.directory",
    "realmSlug": "personal",
    "lastStatus": "completed",
    "lastRunAt": 1779457925868,
    "errorsCount": 0,
    "cursor": {
      "completedAt": 1779457925868
    }
  }
]
[exit] 0
```

```bash
$ ctxindex search "quokka"
1	01KS7ZA8GCNG2T7ANNV577J5JF	alpha.txt	file:///var/folders/jy/098pldf54rj47nxsdhy7p1100000gn/T/tmp.0WuDrUh5J2/alpha.txt	quokka orchard alpha note for ctxindex search.
[exit] 0
```

```bash
$ ctxindex skills list
getting-started	Use ctxindex to build a local-first searchable index of your own files and provider data.
README	This directory holds agent-facing skill docs that travel with the ctxindex release.
[exit] 0
```

```bash
$ ctxindex skills get getting-started
# Getting started with ctxindex

Use ctxindex to build a local-first searchable index of your own files and provider data.

Start with the [CLI overview](./reference/cli-overview.md) for the core command flow.

## First run

1. Run `ctxindex init`.
2. Add a source.
3. Run `ctxindex sync`.
4. Search with `ctxindex search <query>`.

[exit] 0
```

```bash
$ ctxindex auth --help
ctxindex auth <subcommand>

Subcommands:
  add google [--from-env | --client-id <id> --client-secret <secret> [--auth-code <code> | --loopback]]
  list [--json]
[exit] 0
```

