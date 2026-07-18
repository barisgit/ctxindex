## Capability Implementation Targets

- `profile-vocabulary` → `openspec/specs/profile-vocabulary/implementation.md`

## Module Ownership

No durable implementation-doctrine change is introduced. Profiles remain owned by the Profiles package, the built-in Extension remains the composition root, and external Extensions continue to use the public Extension SDK.

## Interfaces and Data Flow

No public or internal interface, dependency direction, or data flow changes. The existing built-in registry inventory is evidence for the documentation correction, not an implementation target.

## Storage and State

Not applicable.

## Security and Compatibility

No trust, egress, secret, compatibility, or migration boundary changes. The repository is pre-alpha, but this correction does not alter persisted payloads or schema.

## Verification

Retain the existing built-in Extension registry test as the runtime source of evidence. Add a focused static guard that locks the canonical specification and accepted design to that inventory, then run the built-ins test, strict OpenSpec validation, and `git diff --check`.

## Promotion Notes

No doctrine must be merged into `openspec/specs/profile-vocabulary/implementation.md` before archive because the public Profile interfaces and module boundaries are unchanged.
