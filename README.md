# Ad Orbit → HubSpot Current-Issue Status

A scheduled TypeScript job that marks HubSpot companies as purchased or not purchased for each publication's current sales issue.

It deliberately uses configured Ad Orbit issue IDs. Ad Orbit's `currentprint` filter returns complete orders—including old and future line items—so the job verifies each nested line item's `publicationId`, `issueId`, and `isKilled` value before changing HubSpot.

## Company API

Start the server with `npm run dev`, then run the requests in `companies.http`
from WebStorm after replacing the example company IDs.

- `PUT /companies/:id` accepts a JSON object of company properties to update.
- `PUT /companies/bulk` accepts `{ "companyIds": ["123", "456"], "properties": { "dead": 0 } }`.
  The same properties are applied to every unique ID. The response includes a
  result for each company; HTTP 207 indicates that one or more updates failed.
  Successful updates are retained if another company fails.

All outgoing Ad Orbit requests share a queue within the server process, with at
least one second between requests (including verification GETs). Set
`ADORBIT_REQUEST_INTERVAL_MS` to a positive integer in `.env` to change this
spacing. A 429 pauses the queue and retries the failed request up to five times,
respecting `Retry-After` seconds or dates and using exponential backoff from
2 to 60 seconds. Every company receives these retries independently; exhausted
failures are included in `failedIds` in the bulk response for resubmission.
Non-429 errors are reported without automatic retries. Large batches take at
least two seconds per company; increase the HTTP client timeout as needed.
Multiple server processes each have their own queue, so account for their
combined traffic when choosing the interval.

Only supplied properties are sent to Ad Orbit. Boolean properties accept
`true`, `false`, `1`, or `0`. `typeId` and `marketId` accept integers; all other
listed company properties accept strings. An optional single-company body `id`
must match the URL; bulk properties cannot include `id`.
The existing `/company` route prefix also remains available.
Outgoing Ad Orbit updates use form encoding, with booleans encoded as `1` or `0`.
Each PUT is followed by a GET. Returned fields are compared with the requested
values, and `dead` is checked against the inverse of `active` when necessary.
Fields absent from the GET response cannot be verified. A verification failure
returns HTTP 502 for a single update or a failed result in a bulk response.

## HubSpot setup

`PUT /hubspot/companies/bulk` accepts a list of `companyNames` and shared
`properties` containing `archived` and/or `bh_family_status`. See `companies.http`
for the request that sets `archived` to `No` and `bh_family_status` to `Prospect`.
This route uses `HUBSPOT_ACCESS_TOKEN`, validates property values against your
HubSpot account, and matches full company names ignoring case and surrounding
whitespace. Repeated names are processed once. Missing names and names matching
multiple companies are reported without updating them. Other companies continue
updating, and HTTP 207 indicates any per-company failures. Each update is read
back to confirm the properties. `archived` here is the custom company property
labeled Archived; it does not restore records from HubSpot's recycling bin.

Create one dropdown property per publication. Example:

- Label: `Family Current Issue Status`
- Internal name: `family_current_issue_status`
- Options:
    - `Purchased` with internal value `purchased`
    - `Not purchased` with internal value `not_purchased`

The existing company property containing Ad Orbit's company ID must also be available. Its default internal name in this project is `ad_orbit_id`.

Keep general relationship properties such as `Family Status` and suppression properties such as `Do not contact` separate. This job does not modify them.

## Configure

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env
cp publications.example.json publications.json
```

Fill in `.env` using the same `API_BASE_URL`, `PUBLIC_KEY`, and `API_KEY` values as your existing Ad Orbit script, then list every publication in `publications.json`:

```json
[
  {
    "name": "Black Hills Family",
    "publicationId": "27",
    "targetIssueId": "618",
    "hubspotStatusProperty": "family_current_issue_status",
    "purchasedValue": "purchased",
    "notPurchasedValue": "not_purchased"
  }
]
```

When a new issue starts selling, change only `targetIssueId` and run a dry run.

## Run safely

```bash
npm run dry-run
```

The dry run reports:

- Purchased-company count per publication
- Number of HubSpot records that would change
- Ad Orbit purchasers whose `companyID` has no corresponding HubSpot company

After reviewing it:

```bash
npm run sync
```

For production:

```bash
npm run build
node --env-file=.env dist/index.js --dry-run
node --env-file=.env dist/index.js
```

## Plesk scheduled task

Run every 15 minutes using the Node binary configured for the domain:

```bash
cd /var/www/vhosts/YOUR-DOMAIN/current-issue-sync && /path/to/node --env-file=.env dist/index.js
```

Do one dry run manually before enabling the scheduled task.

## Workflow pattern

Renewal workflow enrollment:

```text
Family Status = Current client
AND Family Current Issue Status = Not purchased
```

Prospecting workflow enrollment:

```text
Family Status = Prospect
AND Family Current Issue Status = Not purchased
```

Before every email, branch on the status again. If it is `Purchased`, end the workflow.

## Important behavior

Every run calculates the full current truth for configured issues:

- Matching, non-killed line item → `purchased`
- No matching line item → `not_purchased`

Only HubSpot companies that already contain an Ad Orbit ID are managed. Companies without that ID are left untouched.

The implementation matches Ad Orbit's unusual authentication exactly: it signs the full URL with HMAC-SHA512, converts the digest to hexadecimal text, base64-encodes that text, and sends `ADORBIT public-key:signature`. It discovers the orders URL from the API root and requests `currentprint=1`.
