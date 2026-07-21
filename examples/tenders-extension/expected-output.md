# Captured demo output

These documents preserve the actual `--format json` CLI shapes from the packed-artifact walkthrough. Only generated ids and timestamps are replaced with explicit `<placeholders>`; fixture content is exact. Use the final CLI renderer itself, not hand-authored tables, for pretty screenshots.

## Sync

```json
{
  "mode": "sync",
  "results": [
    {
      "sourceId": "<source-id>",
      "status": "completed",
      "run": {
        "runId": "<run-id>",
        "mode": "sync",
        "status": "completed",
        "added": 8,
        "updated": 0,
        "deleted": 0,
        "warningsCount": 0,
        "lastWarning": null,
        "errorsCount": 0,
        "warnings": []
      }
    }
  ],
  "warnings": []
}
```

## Typed field search

Command:

```sh
ctxindex search cybersecurity --realm demo \
  --kind ctxindex.demo.tender \
  --field status=open \
  --format json
```

Output:

```json
{
  "results": [
    {
      "ref": "ctx://<source-id>/tender/DEMO-2026-001",
      "profile": { "id": "ctxindex.demo.tender", "version": 1 },
      "sourceId": "<source-id>",
      "origin": "local",
      "originRank": 0,
      "title": "Cybersecurity incident response retainer",
      "summary": "Three-year incident response retainer covering 24/7 triage, threat hunting, forensic analysis, and annual tabletop exercises.",
      "occurredAt": 1783324800000,
      "chunks": [
        {
          "index": 1,
          "snippet": "Alpine Example Digital Agency <mark>cybersecurity</mark> services"
        }
      ]
    }
  ],
  "warnings": []
}
```

## Complete retrieval

```json
{
  "resource": {
    "id": "<resource-id>",
    "ref": "ctx://<source-id>/tender/DEMO-2026-001",
    "sourceId": "<source-id>",
    "realmId": "demo",
    "profile": { "id": "ctxindex.demo.tender", "version": 1 },
    "origin": "synced",
    "title": "Cybersecurity incident response retainer",
    "summary": "Three-year incident response retainer covering 24/7 triage, threat hunting, forensic analysis, and annual tabletop exercises.",
    "occurredAt": 1783324800000,
    "providerUpdatedAt": 1783324800000,
    "deletedAt": null,
    "hydratedAt": "<timestamp-ms>",
    "payload": {
      "reference": "DEMO-2026-001",
      "title": "Cybersecurity incident response retainer",
      "buyer": "Alpine Example Digital Agency",
      "publishedAt": "2026-07-06T08:00:00.000Z",
      "deadline": "2026-08-14T10:00:00.000Z",
      "status": "open",
      "category": "cybersecurity services",
      "currency": "EUR",
      "estimatedValue": 480000,
      "description": "Three-year incident response retainer covering 24/7 triage, threat hunting, forensic analysis, and annual tabletop exercises."
    },
    "createdAt": "<timestamp-ms>",
    "updatedAt": "<timestamp-ms>"
  },
  "warnings": []
}
```

## Homepage copy

Try ctxindex before connecting an account. Install the official providerless demo, Sync eight wholly synthetic tenders, search by meaning or typed fields, and follow a stable Ref to the complete Resource. No OAuth, secrets, provider traffic, scraping, or prepared files.
