## Why

ctxindex can represent multiple Accounts and Sources, but its current Google-only authorization creates duplicate Accounts, derives overbroad scopes from every loaded Google Adapter, and can silently change secret stores without updating configuration. Adding calendar and Microsoft context on that foundation would risk stranded credentials, confusing inventory, and excessive consent. The next product increment must first make authentication and secret storage provider-neutral and explicit, then prove the model with Google Calendar and Microsoft Graph mail/calendar while retaining the strict no-send boundary.

## What Changes

- Replace implicit secret-store fallback and argv passphrases with an explicit, inspectable backend selection and safe Keychain/encrypted-file movement workflow.
- **BREAKING**: replace `secrets migrate <backend> [--passphrase]` with `secrets status` and `secrets backend set <keychain|file>`; prototype CLI compatibility is intentionally not retained.
- Generalize OAuth authorization around loaded Adapter auth declarations, exact caller-selected Adapter scope unions, stable provider identity resolution, refresh, and provider-neutral Account/Grant upsert.
- **BREAKING**: require `auth add <provider>` to name the Adapter definitions being authorized rather than requesting every scope from every loaded Adapter of that provider; replace the Google-only `auth list` inventory with provider-neutral `account list`.
- Add deterministic `account list` output nesting safe Account, Grant, Realm, and Source information without secret values.
- Add the provider-neutral `calendar.event@1` Profile and read-only `google.calendar@1` and `microsoft.calendar@1` indexed Source Adapters.
- Add `microsoft.mailbox@1` for Microsoft Graph message discovery, retrieval, conversations, attachments, exports, and the existing reversible Draft create/update Actions.
- Request Microsoft `Mail.ReadWrite` only where Draft Actions require it and never request `Mail.Send`; add no send Action or route.
- Add a V1.1 milestone for these capabilities, mocked compiled-CLI proofs, bounded network/security gates, and explicit Human Google/Microsoft consent checkpoints.

## Capabilities

### New Capabilities

- `secret-backend-operations`: Safe backend discovery, explicit selection, movement, failure recovery, and non-disclosure behavior.
- `account-grant-management`: Provider-neutral OAuth, stable Account identity, Grant scope compatibility, deduplication, and Account/Source inventory.
- `calendar-context`: The `calendar.event@1` vocabulary, identity, sync, retrieval, and read-only mutation boundary shared across providers.
- `google-calendar-adapter`: Google Calendar configuration, incremental synchronization, retrieval, tombstones, consent, and provider error behavior.
- `microsoft-graph-adapters`: Microsoft identity authorization plus Graph mailbox/calendar reads, attachments, conversations, Draft persistence, and strict no-send behavior.

### Modified Capabilities

- `generic-storage`: Strengthen explicit Account/Grant identity, deduplication, and compatible Source binding requirements.
- `profile-vocabulary`: Require the loaded registry interface to expose the new calendar vocabulary and provider-neutral auth/configuration affordances.
- `provider-actions`: Require both Google and Microsoft mailbox Adapters to implement the same reversible Draft Actions while preserving the exact no-send boundary.
- `search-routing`: Extend unified indexed/federated routing proofs to calendar and Microsoft mailbox Sources across multiple Accounts and Realms.
- `retrieval-and-artifacts`: Extend complete retrieval, thread Relations, attachments, caching, and export behavior to Microsoft mailbox Resources.

## Impact

The change affects the public Extension SDK auth declaration, core config/secrets/auth/account/source/provider-context modules, generic registries, CLI auth/account/secrets commands and generated guidance, Profile definitions, bundled Google and new Microsoft Adapter modules, OAuth/network allowlists, mocks, storage constraints, V1.1 milestone documentation, and compiled CLI tests. It adds Microsoft identity/Graph provider traffic only through declared active Sources. Existing prototype databases and command aliases are disposable; stable Resource/Action contracts, generic storage, exit meanings, external Extension loading, and V1 no-send behavior remain unchanged.
