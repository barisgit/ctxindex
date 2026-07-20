## ADDED Requirements

### Requirement: Managed OAuth failures keep stable exits and bounded BYOA guidance
Managed-default absence, inactive App, provenance mismatch, or ambiguous host policy detected before effects MUST be `invalid_oauth_selection` and exit `2`. Provider failures after a managed App is selected MUST retain their existing typed codes and mappings: `invalid_client`, `oauth_failed`, and `needs_auth` exit `10`; `rate_limited` exits `20`; `network_error`, `network`, `provider_unavailable`, and `provider_quota` exit `30`; `permission_denied` exits `40`; and `authorization_denied`, `insufficient_scope`, `unknown_auth_error`, and other internal auth failures exit `50`. Managed selection MUST NOT reinterpret a Provider or auth failure merely to obtain a different exit.

Managed-default and exact managed-App resolution failures MUST make no partial Account or Grant change and MUST provide deterministic guidance to run `oauth-app add <provider> <label> --from-env` followed by `account add <provider> --app <label>`. Once exact App resolution succeeds, later Provider/auth failures MUST NOT receive selection fallback or automatically retry through another App. Guidance, errors, logs, diagnostics, inventory, persistence, and provider-response output MUST NOT expose App config, environment values, client ids, secret references/values, tokens, authorization codes, PKCE verifiers, raw provider responses, private identities, or state outside the one dedicated authorization-URL delivery surface.

#### Scenario: No managed App is invalid usage
- **WHEN** `account add google` omits `--app` and no exact managed Google App is active
- **THEN** CLI exits `2` before effects and prints explicit local-App creation and selection commands

#### Scenario: Managed rate limit keeps rate exit
- **WHEN** the provider reports typed `rate_limited` after managed authorization starts
- **THEN** CLI exits `20`, preserves safe retry metadata when available, and does not start BYOA authorization automatically

#### Scenario: Managed provider quota keeps provider exit
- **WHEN** the provider reports typed `provider_quota` after managed authorization starts
- **THEN** CLI exits `30` and does not start BYOA authorization automatically

#### Scenario: Authorization denial keeps auth exit
- **WHEN** a provider rejects managed consent as typed `authorization_denied` or `insufficient_scope`
- **THEN** CLI exits `50`, emits only the safe typed failure without selection fallback, and persists no Account or Grant

#### Scenario: Permission denial keeps permission exit
- **WHEN** a provider reports typed `permission_denied`
- **THEN** CLI exits `40`, emits only the safe typed failure without selection fallback, and persists no Account or Grant
