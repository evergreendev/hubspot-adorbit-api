# Ad Orbit → HubSpot Current-Issue Status

A scheduled TypeScript job that marks HubSpot companies as purchased or not purchased for each publication's current sales issue.

It deliberately uses configured Ad Orbit issue IDs. Ad Orbit's `currentprint` filter returns complete orders—including old and future line items—so the job verifies each nested line item's `publicationId`, `issueId`, and `isKilled` value before changing HubSpot.

## HubSpot setup

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
