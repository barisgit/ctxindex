# Synthetic Tender Profile

`ctxindex.demo.tender@1` describes one fictional procurement notice. Every demo Resource is complete and contains:

| Property | Type | Meaning |
| --- | --- | --- |
| `reference` | string | Stable `DEMO-2026-NNN` fixture reference |
| `title` | string | Short opportunity title |
| `buyer` | string | Fictional purchasing organization |
| `publishedAt` | datetime | Static fixture publication timestamp |
| `deadline` | datetime | Static fixture response deadline |
| `status` | enum | `open`, `planned`, `awarded`, or `cancelled` |
| `category` | string | Procurement category |
| `currency` | literal | `EUR` |
| `estimatedValue` | number | Fictional estimated value before tax |
| `description` | string | Searchable scope summary |

The typed field index exposes `reference`, `buyer`, `status`, `category`, `estimatedValue`, `deadline`, and `publishedAt`. The title, description, buyer, and category contribute to full-text discovery.

Example:

```sh
ctxindex search --realm demo --kind ctxindex.demo.tender \
  --field status=open \
  --field category='cybersecurity services'
```

The profile defines no Actions, Relations, Artifacts, or export formats.
