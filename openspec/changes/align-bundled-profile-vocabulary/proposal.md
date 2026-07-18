## Why

The canonical Profile vocabulary specification and accepted V1 design contradict the implemented bundled registry by naming unimplemented conversation, task, and artifact Profiles and promising MBOX and ICS exports. The contract must describe the three Profiles actually bundled in V1 without reserving future extension-defined domains or formats.

## What Changes

- Define the V1 bundled vocabulary consistently as `communication.message@1`, `calendar.event@1`, and `file@1`.
- Remove current-bundle claims for conversation, task, and artifact Profiles and for MBOX and ICS exports.
- Clarify that V1 Resource composition uses one primary Profile plus Artifact descriptors, not an `artifact` Profile.
- Preserve the public Profile API for extension-defined Profiles and future domains.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `profile-vocabulary`: Align the bundled Profile contract with the three V1 definitions registered by the built-in Extension while retaining generic external Profile support.

## Impact

This is a normative specification and accepted-design correction only. It affects the `profile-vocabulary` contract, its accepted design projection, and a focused static regression guard. Runtime registries, providers, exports, schemas, historical milestones, and extension APIs are unchanged.
