## Capability Implementation Targets

- `realm-and-source-management` -> `openspec/specs/realm-and-source-management/implementation.md`
- `sync-operations` -> `openspec/specs/sync-operations/implementation.md`

## Module Ownership

Provider-neutral core owns the `AddSourceInput` policy and its storage in the existing Source row. The thin CLI owns exact argv validation, Citty declaration, conversion of `--no-sync` to the core boolean, and JSON presentation. Sync orchestration continues to consume `SourceRow.sync_enabled`; no Adapter receives or owns the policy.

## Interfaces and Data Flow

`AddSourceInput` adds optional `syncEnabled?: boolean`. The Source service resolves all existing Realm, Adapter, Grant, label, configuration, and routing inputs unchanged, then inserts the effective boolean. CLI parsing returns `syncEnabled: false` only for one valid bare flag; omission need not add a field. Command delegation forwards the parsed value without changing Account/Grant or config validation order. Source JSON maps `SourceRow.sync_enabled` to `syncEnabled`.

The parser remains the failure boundary for malformed generic options so dependency opening does not occur. Targeted and all-Source sync continue to use the stored `SourceRow` field before invoking `syncSource`.

## Storage and State

The canonical `sources.sync_enabled` column remains the sole source of truth. Creation writes both true and false explicitly. There is no new table, migration, update operation, or mutation of existing rows.

## Security and Compatibility

The option does not affect Grant resolution, secrets, provider egress authorization, or independently supported Source operations. The repository is pre-alpha, but omission preserves the existing enabled default. No compatibility alias is introduced.

## Verification

Core Source service tests cover omitted, false, and true persistence through public service reads. Parser tests cover the valid bare flag and invalid assignment, repetition, and malformed inputs. An isolated CLI test proves invalid argv does not open state and a valid flag is forwarded. Generated argument tests pin the Citty declaration. Formatter and Source e2e tests pin `syncEnabled` JSON. Existing sync command tests pin all-Source skipping and targeted disabled-Source zero-provider behavior. Strict OpenSpec validation, typecheck, Biome, and diff checks cover cross-cutting consistency.

## Promotion Notes

- Merge the optional `syncEnabled` member, explicit creation persistence, and JSON-facing verification doctrine into `openspec/specs/realm-and-source-management/implementation.md`.
- Merge the stored-policy pre-provider filtering and focused orchestration verification doctrine into `openspec/specs/sync-operations/implementation.md`.
