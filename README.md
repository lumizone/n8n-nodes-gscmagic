# n8n-nodes-gscmagic

An n8n community node for [GSC Magic](https://gscmagic.com): Google Search Console reports and analytics inside your n8n workflows.

The node talks to the hosted GSC Magic MCP endpoint over plain HTTPS (JSON-RPC 2.0). It has no runtime dependencies and every operation is read-only.

## Features

- Search performance (clicks, impressions, CTR, position) by query, page, country, device, date or hour, with filters.
- Ready-made SEO reports: traffic drops and gains, quick wins, content decay, index health.
- URL Inspection: indexed or not, canonicals, last crawl, robots state.
- Optional PNG chart of the result as n8n binary data (`chart`).
- Site picker that loads your Search Console properties, plus manual entry.
- **Call Any Tool** for everything else GSC Magic exposes (Bing Webmaster, GA4, Core Web Vitals and more), with the tool list loaded from your account.
- Usable as an AI tool in n8n agents.

## Installation

In n8n open **Settings > Community Nodes > Install** and enter:

```text
n8n-nodes-gscmagic
```

After n8n verification the node can also be installed straight from the node panel by searching for `GSC Magic`.

## Credentials

1. Sign in to [app.gscmagic.com](https://app.gscmagic.com), open **Connect** and create an **Access token**. A read-only token with an expiry date is recommended.
2. In n8n create a **GSC Magic API** credential and paste the token (it starts with `gsm_`).
3. Leave **Endpoint** as `https://mcp.gscmagic.com/mcp` unless you test against your own installation. Remote endpoints must use HTTPS; plain HTTP is accepted only for `localhost`, `127.0.0.1` and `[::1]`.

The credential test lists the available tools, so a wrong, expired or revoked token fails right away.

## Operations

| Operation | GSC Magic tool | Main fields |
| --- | --- | --- |
| List Sites | `gsc_list_sites` | none |
| Search Analytics | `gsc_query_analytics` | Site, Date Range (or custom dates), Dimensions, Filters, Limit, Search Type, Data State, Include Chart |
| Traffic Drops | `report_traffic_drops` | Site, Date Range, Group By (page or query), Limit, Include Chart |
| Quick Wins | `report_quick_wins` | Site, Date Range, Minimum Impressions, Limit, Include Chart |
| Content Decay | `report_content_decay` | Site, Date Range, Minimum Clicks, Minimum Drop (%), Limit |
| Index Health | `report_index_health` | Site, Sitemap URL (optional), Max URLs |
| Inspect URL | `gsc_inspect_url` | Site, URL, Language Code |
| Call Any Tool | any tool from `tools/list` | Tool, Arguments (JSON) |

**Site** accepts a property from the list (`sc-domain:example.com`, `https://example.com/`) or any domain or URL that GSC Magic can match to one of your properties.

**Date Range** presets end yesterday. Choose **Custom** for exact `Start Date` and `End Date`. Google finalizes Search Console data with a delay of two to three days.

### Output

Each call returns one item with the JSON of the GSC Magic tool. List Sites returns `{ "result": [ ... ] }`.

Turn on **Split Into Items** to get one item per row instead:

| Operation | Rows |
| --- | --- |
| List Sites | each property |
| Search Analytics, Quick Wins, Content Decay | each entry of `rows` |
| Traffic Drops | each loser and gainer, with a `direction` field (`loser` or `gainer`) |
| Index Health | each URL in `not_indexed` |
| Call Any Tool | the root array, or `rows` |

The summary object is not part of the items in that mode, so keep a second branch without splitting if you need totals.

**Include Chart** adds `chart: true` to the tool call and returns the PNG in `binary.chart` (the first item when splitting). It is off by default.

### Errors

- A wrong, expired or revoked token stops the node with: *GSC Magic rejected the access token (wrong, expired or revoked). Create a new token in the dashboard > Connect > Access tokens.*
- Errors reported by GSC Magic, such as a plan limit, an unknown property or a Google API error, are shown unchanged.
- With **Continue On Fail** the item carries an `error` field and stays linked to its input item.
- The token is never written to the output or to error messages.

## Plan limits

Every tool call counts against your GSC Magic plan, including calls that fail. The Free plan allows 10 calls per day and 200 per month. Listing the tools (credential test and the Call Any Tool dropdown) does not count, but the site picker runs `gsc_list_sites`, which counts as one call. Type the site by name to avoid that call. See the dashboard for your current usage.

## Example workflows

Import the files from `examples/` into n8n:

- `weekly-traffic-drops-email.json`: every Monday, find the pages that lost clicks and e-mail the table with the chart.
- `seo-assistant-agent.json`: a chat agent that uses three GSC Magic nodes as tools.

## Alternative: MCP Client Tool

If you only need GSC Magic inside an AI agent, n8n's built-in **MCP Client Tool** works too: endpoint `https://mcp.gscmagic.com/mcp`, transport HTTP Streamable, authentication Bearer with the same `gsm_` token. This package is for classic workflows with typed fields, split items and binary charts.

## Compatibility

- Tested against n8n 2.45.3 (n8n Nodes API version 1).
- Node.js 20.19 through 24.

## Development

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

Requirements: Node.js 22.22 or newer for development and npm 11 or newer. The tests cover request building, JSON and SSE parsing, result extraction, error mapping, argument mapping, splitting, UI metadata and the example workflows.

## Release verification

```bash
npm run verify
npm audit --omit=dev --omit=peer --audit-level=high
npm pack --dry-run
```

## Security

- The access token is stored as an n8n password credential and sent as a Bearer header.
- Redirects are refused and credentials are not sent cross-origin.
- Requests time out after 30 seconds (tool list) or 120 seconds (tool calls).
- Remote endpoints must use HTTPS.
- No runtime dependencies, no environment variable access, no filesystem access.

Report security issues privately to `contact@gscmagic.com`.

## License

[MIT](LICENSE.md)
