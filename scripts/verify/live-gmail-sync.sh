#!/usr/bin/env bash
set -euo pipefail

skip() {
  echo "$1" >&2
  exit 77
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
db_path="$HOME/.local/share/ctxindex/ctxindex.sqlite"
export CTXINDEX_DATA_HOME="$(dirname "$db_path")"

[[ -f "$db_path" ]] || skip "live ctxindex database not found: $db_path"

json_eval() {
  DB_PATH="$db_path" bun -e "$1"
}

ensure_client_ref_columns() {
  json_eval '
    const { Database } = require("bun:sqlite");
    const db = new Database(process.env.DB_PATH, { readonly: true });
    const columns = db.prepare("PRAGMA table_info(grants)").all().map((row) => row.name);
    db.close();
    process.exit(columns.includes("client_id_ref") && columns.includes("client_secret_ref") ? 0 : 1);
  '
}

if ! ensure_client_ref_columns; then
  (cd "$repo_root" && bun run scripts/with-timeout.ts 60 -- ctxindex status --json >/dev/null)
  ensure_client_ref_columns || skip "live database is missing grant client credential columns after migration attempt"
fi

grant_json=$(json_eval '
  const { Database } = require("bun:sqlite");
  const db = new Database(process.env.DB_PATH, { readonly: true });
  const row = db.prepare("SELECT id, client_id_ref, client_secret_ref FROM grants WHERE provider = ? ORDER BY created_at DESC LIMIT 1").get("google");
  db.close();
  if (!row) process.exit(1);
  console.log(JSON.stringify(row));
') || skip "no live google grant found in $db_path"

grant_id=$(printf '%s' "$grant_json" | bun -e 'const row = JSON.parse(await new Response(Bun.stdin.stream()).text()); console.log(row.id)')
client_id_ref=$(printf '%s' "$grant_json" | bun -e 'const row = JSON.parse(await new Response(Bun.stdin.stream()).text()); console.log(row.client_id_ref ?? "")')

source_id=$(json_eval '
  const { Database } = require("bun:sqlite");
  const db = new Database(process.env.DB_PATH, { readonly: true });
  const row = db.prepare("SELECT id FROM sources WHERE adapter_id = ? ORDER BY created_at DESC LIMIT 1").get("google.mailbox");
  db.close();
  if (!row) process.exit(1);
  console.log(row.id);
') || skip "no live google.mailbox source found in $db_path"

if [[ -z "$client_id_ref" ]]; then
  if [[ -z "${CTXINDEX_GMAIL_CLIENT_ID:-}" || -z "${CTXINDEX_GMAIL_CLIENT_SECRET:-}" ]]; then
    skip "live grant $grant_id has NULL client_id_ref; re-run \`ctxindex auth add google --client-id <id> --client-secret <secret> --refresh-token <rt>\` OR set CTXINDEX_GMAIL_CLIENT_ID + CTXINDEX_GMAIL_CLIENT_SECRET"
  fi
  echo "live grant $grant_id has NULL client_id_ref; using CTXINDEX_GMAIL_CLIENT_ID/CTXINDEX_GMAIL_CLIENT_SECRET override" >&2
fi

snapshot() {
  local source="$1"
  DB_PATH="$db_path" SOURCE_ID="$source" bun -e '
    const { Database } = require("bun:sqlite");
    const db = new Database(process.env.DB_PATH, { readonly: true });
    const scalar = (sql, ...args) => db.prepare(sql).get(...args).value;
    const state = db.prepare("SELECT cursor_json AS cursor_after, last_status FROM source_sync_state WHERE source_id = ?").get(process.env.SOURCE_ID) ?? { cursor_after: null, last_status: null };
    const result = {
      sync_runs: scalar("SELECT count(*) AS value FROM sync_runs"),
      mail_messages: scalar("SELECT count(*) AS value FROM mail_messages"),
      cursor_after: state.cursor_after,
      last_status: state.last_status,
    };
    db.close();
    console.log(JSON.stringify(result));
  '
}

pre_json=$(snapshot "$source_id")
pre_sync_runs=$(printf '%s' "$pre_json" | bun -e 'const row = JSON.parse(await new Response(Bun.stdin.stream()).text()); console.log(row.sync_runs)')
pre_mail_messages=$(printf '%s' "$pre_json" | bun -e 'const row = JSON.parse(await new Response(Bun.stdin.stream()).text()); console.log(row.mail_messages)')

set +e
(cd "$repo_root" && bun run scripts/with-timeout.ts 300 -- ctxindex sync --source "$source_id")
sync_exit=$?
set -e

case "$sync_exit" in
  0) ;;
  10) echo "grant revoked; re-auth required" >&2; exit 10 ;;
  20) echo "Gmail API rate limit" >&2; exit 20 ;;
  30) echo "network failure during live sync" >&2; exit 30 ;;
  *) echo "live gmail sync failed with exit $sync_exit" >&2; exit "$sync_exit" ;;
esac

post_json=$(snapshot "$source_id")
post_sync_runs=$(printf '%s' "$post_json" | bun -e 'const row = JSON.parse(await new Response(Bun.stdin.stream()).text()); console.log(row.sync_runs)')
post_mail_messages=$(printf '%s' "$post_json" | bun -e 'const row = JSON.parse(await new Response(Bun.stdin.stream()).text()); console.log(row.mail_messages)')
post_cursor=$(printf '%s' "$post_json" | bun -e 'const row = JSON.parse(await new Response(Bun.stdin.stream()).text()); console.log(row.cursor_after ?? "")')
post_status=$(printf '%s' "$post_json" | bun -e 'const row = JSON.parse(await new Response(Bun.stdin.stream()).text()); console.log(row.last_status ?? "")')

if (( post_sync_runs <= pre_sync_runs )); then
  echo "expected sync_runs to increase (before=$pre_sync_runs after=$post_sync_runs)" >&2
  exit 1
fi
if (( post_mail_messages < pre_mail_messages )); then
  echo "expected mail_messages not to decrease (before=$pre_mail_messages after=$post_mail_messages)" >&2
  exit 1
fi
if [[ -z "$post_cursor" ]]; then
  echo "expected source_sync_state.cursor_after to be set" >&2
  exit 1
fi
if [[ "$post_status" != "ok" && "$post_status" != "completed" ]]; then
  echo "expected source_sync_state.last_status to be ok or completed, got '$post_status'" >&2
  exit 1
fi

printf '%-18s %12s %12s\n' metric before after
printf '%-18s %12s %12s\n' sync_runs "$pre_sync_runs" "$post_sync_runs"
printf '%-18s %12s %12s\n' mail_messages "$pre_mail_messages" "$post_mail_messages"
printf '%-18s %12s %12s\n' cursor_after "$(printf '%s' "$pre_json" | bun -e 'const row = JSON.parse(await new Response(Bun.stdin.stream()).text()); console.log(row.cursor_after ? "set" : "null")')" "set"
printf '%-18s %12s %12s\n' last_status "$(printf '%s' "$pre_json" | bun -e 'const row = JSON.parse(await new Response(Bun.stdin.stream()).text()); console.log(row.last_status ?? "null")')" "$post_status"
