# Task 6.4 private live checkpoint runbook

Human checkpoint for task 6.4. An operator runs it once on a supported platform (Linux or macOS) from a checkout of the branch under review, then records the outcome outside Git. Automation never runs it.

Safety rules:

- Everything lives under one throwaway directory, `$LIVE`. The real ctxindex state (`~/.local/share/ctxindex`, `~/.config/ctxindex`, and so on) is never touched.
- No secret is entered into, copied into, or committed to the repository. The managed Google App needs no client secret. If you bring your own OAuth App, export its values only in this shell and unset them right after use.
- Secrets stay in the isolated file backend inside `$LIVE`, not in the login keychain.
- Email is never sent. The only provider mutations are Gmail Draft create and update. Delete the test Draft in Gmail when you finish.
- Record outcomes (pass/fail, exit codes, instance changes) in a private note. Redact addresses, subjects, Refs, and message content.

Run every block in the same shell, from the repository root.

## 1. Setup with isolated state

```bash
bun --version   # must print 1.3.14
bun install --frozen-lockfile
export LIVE="$(mktemp -d /tmp/ctxd-live.XXXXXX)"
mkdir -m 700 "$LIVE/bin" "$LIVE/run" "$LIVE/files" "$LIVE/out"
export CTXINDEX_CONFIG_HOME="$LIVE/config" CTXINDEX_DATA_HOME="$LIVE/data"
export CTXINDEX_STATE_HOME="$LIVE/state" CTXINDEX_CACHE_HOME="$LIVE/cache"
export CTXINDEX_DAEMON_RUNTIME_ROOT="$LIVE/run"
bun build --compile apps/cli/bin/ctxindex.mjs --outfile "$LIVE/bin/ctxindex"
bun build --compile apps/daemon/src/main.ts --outfile "$LIVE/bin/ctxindex-daemon"
cx() { "$LIVE/bin/ctxindex" "$@"; }

cx init                                   # direct bootstrap exception
cx daemon status                          # expect: stopped
cx secrets backend set file               # first stateful command starts the daemon
cx secrets status --format json           # expect: "backend": "file"
cx daemon status                          # note the instance id and pid
```

- [ ] `init` succeeds, the first stateful command starts one daemon, and secrets use the file backend.

## 2. Local sync, search, get, and thread

```bash
printf 'live checkpoint proof\n' > "$LIVE/files/note.txt"
cx realm add live
cx source add local.directory --realm live --label files --config-root-path "$LIVE/files"
cx sync --source files --format json
REF="$(cx search 'live checkpoint proof' --local-only --refs | head -n 1)"
cx get "$REF" --format json
cx thread "$REF" --format json
cx status --source files --format json
```

- [ ] Sync completes; search, get, thread, and status return the note; `cx daemon status` shows the same instance.

## 3. OAuth authorization

Managed Google App (default). The CLI prints the consent URL and opens the browser; approve it in the browser.

```bash
cx account add google --label live
cx account list --format json
```

Only if the managed App is unavailable, bring your own Google desktop App. Type the values at the hidden prompts; they never reach a file:

```bash
read -r -p 'Client ID: ' CTXINDEX_GOOGLE_CLIENT_ID
read -r -s -p 'Client secret: ' CTXINDEX_GOOGLE_CLIENT_SECRET; echo
export CTXINDEX_GOOGLE_CLIENT_ID CTXINDEX_GOOGLE_CLIENT_SECRET
cx oauth-app add google byoa --from-env
unset CTXINDEX_GOOGLE_CLIENT_ID CTXINDEX_GOOGLE_CLIENT_SECRET
cx oauth-app list --format json
cx account add google --app byoa --label live
```

```bash
cx source add google.mailbox --realm live --account live --label gmail
```

- [ ] Consent completes through the daemon-owned loopback listener; `account list` shows `live`; no token or secret appears in any output.

## 4. Remote search, get, and thread

```bash
MSG="$(cx search 'newer_than:30d' --remote --source gmail --limit 3 --refs | head -n 1)"
cx get "$MSG" --format json > /dev/null && echo get-ok
cx thread "$MSG" --format json > /dev/null && echo thread-ok
```

- [ ] Remote search returns Refs; get and thread succeed.

## 5. Draft Action (create and update only, never send)

Use your own address as the only recipient.

```bash
ME='you@example.com'   # replace with your own address
cx describe action mail.message.draft.create --source gmail
cx action run mail.message.draft.create --source gmail --format json \
  --input "{\"to\":[\"$ME\"],\"subject\":\"ctxindex live checkpoint\",\"bodyText\":\"Draft only. Do not send.\"}"
DRAFT='<resource.ref from the output above>'
cx action run mail.message.draft.update --source gmail --format json \
  --input "{\"ref\":\"$DRAFT\",\"to\":[\"$ME\"],\"subject\":\"ctxindex live checkpoint (updated)\",\"bodyText\":\"Draft only. Do not send.\"}"
```

- [ ] Gmail shows one Draft with the updated subject; nothing was sent. Delete the Draft in Gmail when you finish.

## 6. Artifact download and export

```bash
ATT_MSG="$(cx search 'has:attachment newer_than:365d' --remote --source gmail --limit 1 --refs | head -n 1)"
cx artifact list "$ATT_MSG" --format json
ART='<artifacts[0].ref from the output above>'
cx artifact download "$ART" --output "$LIVE/out/first" --format json    # expect cache: miss
cx artifact download "$ART" --output "$LIVE/out/second" --format json   # expect cache: hit
cx export "$ATT_MSG" --format eml > "$LIVE/out/message.eml" && echo export-ok
cx artifact purge --format json
```

- [ ] The downloaded files match and are mode `0600`; the second download is a cache hit; export writes the message; purge reports the removed Artifact.

## 7. Extension activation boundary

```bash
mkdir -p "$LIVE/ext"
printf '%s' '{"name":"live-activation","version":"1.0.0","type":"module","ctxindex":{"extensions":["./dist/extension.js"]}}' > "$LIVE/ext/package.json"
bun build apps/daemon/src/e2e/fixtures/extension-registry/activation-v1.ts --target=bun --outfile "$LIVE/ext/dist/extension.js"
cx daemon status                                   # note the instance id
cx extension catalog list --no-refresh             # filesystem-only; instance unchanged
cx extension install local "$LIVE/ext" fixture.activation
cx daemon status                                   # expect a new instance id
cx extension list --format json | grep -c fixture.activation   # expect 1
cx extension uninstall fixture.activation
cx extension list --format json | grep -c fixture.activation   # expect 0
```

- [ ] Catalog reads leave the daemon alone; install and uninstall restart the daemon onto the new registry, and the output does not claim an in-process reload.

## 8. Cancellation

```bash
for i in $(seq 1 20000); do printf 'bulk %s\n' "$i" > "$LIVE/files/bulk-$i.txt"; done
cx sync --source files --mode resync     # press Ctrl-C within about a second
echo "exit=$?"                           # expect 130
cx daemon status --format json           # expect ready, activeRequestCount 0, same instance
cx status --source files --format json
```

- [ ] Ctrl-C exits `130`, the daemon stays healthy on the same instance, Source status records the run as cancelled, and the earlier note is still searchable.

## 9. Shutdown, restart, and crash recovery

```bash
cx daemon stop                    # expect stopped
cx daemon stop                    # expect already stopped
cx realm list                     # starts a new daemon instance
cx search 'live checkpoint proof' --local-only --refs   # indexed state retained
kill -9 "$(cx daemon status --format json | sed -n 's/.*"pid": \([0-9]*\).*/\1/p')"
cx status --source files          # recovers with a new instance, no direct fallback
cx daemon status
```

- [ ] Graceful stop, idempotent stop, automatic restart, and SIGKILL recovery all behave as described.

## 10. Direct exceptions

```bash
cx docs get-skill --format json > /dev/null && echo skill-ok   # no daemon needed
cx init; echo "exit=$?"           # expect 50 while the daemon owns the database
cx daemon stop
cx daemon status                  # expect stopped
```

- [ ] Documented exceptions work without the daemon, and `init` fails closed with exit `50` while the daemon owns the database.

## 11. Cleanup

```bash
cx daemon stop
rm -rf "$LIVE"
unset LIVE CTXINDEX_CONFIG_HOME CTXINDEX_DATA_HOME CTXINDEX_STATE_HOME CTXINDEX_CACHE_HOME CTXINDEX_DAEMON_RUNTIME_ROOT
```

Delete the test Draft in Gmail. Optionally revoke the ctxindex grant at <https://myaccount.google.com/permissions>.

- [ ] No ctxindex daemon process remains (`pgrep -fl ctxindex-daemon`), and the throwaway directory is gone.

Accept task 6.4 only when every box above passes. Report any failure with its step, command, and exit code.
