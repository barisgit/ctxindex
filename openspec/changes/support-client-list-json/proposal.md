## Why

`client list` is the only primary identity inventory command that cannot emit machine-readable JSON. Agents currently have to parse its presentation-oriented text even though Client inventory is already deterministic and secret-safe and comparable Account and Source inventory commands support `--json`.

## What Changes

- Accept `--json` on `client list` and return the existing safe Client inventory metadata as a stable JSON array.
- Preserve the current human-readable output when `--json` is omitted.
- Return `[]` with exit 0 for an empty JSON inventory.
- Document and test the JSON inventory form, including deterministic ordering and secret redaction.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `oauth-client-management`: Require a deterministic, non-sensitive JSON representation for Client inventory alongside the existing human-readable form.

## Impact

The change is limited to CLI argument parsing, command metadata, Client inventory formatting and handling, focused CLI tests, and agent-facing CLI documentation. It does not change Client storage, add/remove behavior, credential handling, Account or Grant inventory, or any provider boundary.
