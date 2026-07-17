## Why

The V1.1 `auth add` command fuses three lifecycle concerns into one step: OAuth client configuration (via environment variables), Account discovery (as a side effect of consent), and Grant scoping (via mandatory up-front `--adapter` selection). Users cannot predict the flow, must repeat client configuration knowledge per authorization, and must understand Adapter/scope vocabulary just to connect an account. The pre-alpha window allows removing this surface outright without compatibility debt.

## What Changes

- **BREAKING** Remove the `auth` command entirely (no aliases, no deprecation path).
- Add `client add <provider> [--label] (--from-env | ...)`, `client list`, and `client remove <provider> <label>`: persist one labeled OAuth client configuration per provider in the secrets backend. The provider id MUST match a loaded declarative OAuth provider spec.
- Add `account add <provider> [--label] [--client <label>]` and `account remove <label>`: one command performs login plus consent for the sorted scope union of ALL loaded Adapters declaring that provider (plus provider base scopes). `--client` auto-resolves when exactly one client exists for the provider. Re-running for the same provider identity upserts (updates label, refreshes Grant) rather than duplicating; re-running after new Extensions are loaded re-consents with the enlarged union — there is no separate refresh verb.
- Extend `account list` with the local account label.
- Labels become referenceable handles: `--account` accepts an account label (in addition to account/grant ids); `--client` accepts a client label. Defaults: client label = provider id; account label = verified provider identity; source label = `<account-label>-<adapter-tail>` (no account: `<adapter-tail>`), all verbatim with no normalization. Label collision is a hard usage error naming the taken label and suggesting `--label`; never auto-suffix or prompt.
- Uniqueness: client labels unique per provider; account and source labels unique globally.
- Provider mismatch is prevented by construction: every command's positional argument fixes the provider, and parent-reference flags resolve only within that provider's pool.
- Runtime OAuth client resolution moves from environment variables to persisted client records; `--from-env` reads the declared environment names once at `client add` time.

## Capabilities

### New Capabilities
- `oauth-client-management`: labeled per-provider OAuth client configuration lifecycle (`client add/list/remove`), secrets-backend persistence, provider validation against loaded declarative OAuth specs, and client resolution rules for account authorization.

### Modified Capabilities
- `account-grant-management`: `auth add` with mandatory Adapter selection is removed; `account add` derives consent from all loaded Adapters for the provider, resolves a persisted labeled client, upserts Accounts with local labels, and `account remove` deletes an Account with its Grants and secret references. Label handle resolution replaces id-only references.
- `generic-storage`: Source creation gains a default label derived from the bound account label and adapter tail, label-based `--account` resolution, and global source-label uniqueness with hard collision errors.

## Impact

- CLI: remove `apps/cli/src/auth/` and `apps/cli/src/args/auth.ts`; add `client` and reworked `account` commands; update `resolveSourceGrant` to accept labels.
- Core: `authorizeProvider` scope derivation changes from explicit selection to all-loaded-adapters union; new client-record persistence and resolution module; Account upsert gains label handling.
- Storage: new client-record storage (secrets backend plus metadata); accounts already carry a label column; grants keep `client_id_ref`/`client_secret_ref` so refresh uses the authorizing client.
- Environment: `CTXINDEX_*_CLIENT_ID`/`_CLIENT_SECRET` become `client add --from-env` inputs rather than runtime resolution paths.
- Generated interfaces: `describe`, help, bundled skills, workflow docs, and `.env.example` regenerate; e2e, egress, and black-box suites rework the authorization vocabulary.
