# Local Daemon Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Direct maintenance exclusion

The CLI coordinates direct installed Extension maintenance with daemon startup through the canonical database lease. The daemon remains Extension-lifecycle-agnostic: startup requires exclusive database ownership before SQLite open or immutable-registry loading, while the direct mutation coordinator retains shared ownership for its complete operation. This dependency direction keeps package acquisition and installed-record mutation out of `@ctxindex/local-daemon`, `@ctxindex/rpc`, and the daemon application.

The coordinator composes the existing typed daemon status, graceful stop, and start operations with direct database ownership. A daemon that was running is stopped before ownership acquisition and restored only after ownership release. Unsupported platforms retain direct behavior because no daemon can own their database.

## Verification

Focused coordinator tests inject lifecycle and ownership effects and assert exact stop–acquire–mutate–release–restart ordering, stopped and unsupported behavior, failure cleanup, and error precedence. Daemon lease tests independently prove shared direct ownership excludes exclusive daemon startup before SQLite open.
