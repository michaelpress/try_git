# Sheet Search

A tiny serverless app that lets you search a Google Sheet from any device. It
runs on Cloud Run, reads the Sheet via the Sheets API, and serves a
single-page search UI.

No API keys are stored anywhere: the Cloud Run service uses its own identity
(a service account) to read the Sheet. You just share the Sheet with that
service account's email, the same way you'd share it with a person.

## How it works

- `server.js` — Express app. `/api/search?q=...` reads the Sheet (cached for
  `CACHE_TTL_MS`, default 30s) and returns rows where any cell contains the
  query (case-insensitive substring match).
- `public/index.html` — single search box, debounced fetch to `/api/search`,
  renders a results table.

## One-time setup

Prereqs: `gcloud` CLI installed and logged in, and your GCP project ID.

```sh
export PROJECT_ID=your-project-id
export REGION=us-central1   # or whichever region you prefer

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com sheets.googleapis.com cloudbuild.googleapis.com
```

Create a dedicated service account for the app (keeps its permissions
minimal — read-only, this app only):

```sh
gcloud iam service-accounts create sheet-search \
  --display-name="Sheet Search Cloud Run service"
```

The service account's email will be:
`sheet-search@$PROJECT_ID.iam.gserviceaccount.com`

**Share your Google Sheet** with that email address as **Viewer** (Sheet's
"Share" button, same as sharing with a person — no key files needed).

Grab your Sheet ID from its URL:
`https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

## Deploy

From the repo root:

```sh
gcloud run deploy sheet-search \
  --source . \
  --region "$REGION" \
  --service-account "sheet-search@$PROJECT_ID.iam.gserviceaccount.com" \
  --set-env-vars SHEET_ID=your-sheet-id,SHEET_RANGE=Sheet1 \
  --allow-unauthenticated
```

`gcloud` builds the container (via Cloud Build) and deploys it. On success it
prints a `*.run.app` URL — open that from any device to search your Sheet.

- `SHEET_RANGE` should name the sheet/tab to read (e.g. `Sheet1`, or
  `Sheet1!A:F` to limit columns). The first row is treated as headers.
- Redeploy after future code changes by re-running the same `gcloud run
  deploy` command.

### Note on access

`--allow-unauthenticated` makes the URL reachable by anyone who has it (no
Google login prompt) — that's what keeps "search from any device" frictionless
for a single user. If the Sheet's contents are sensitive, either keep the URL
private, or drop `--allow-unauthenticated` and instead grant yourself the
`roles/run.invoker` IAM role and access it via `gcloud run services proxy` or
an authenticated request — at the cost of needing to authenticate on each
device.

## Local development

```sh
npm install
export SHEET_ID=your-sheet-id
export SHEET_RANGE=Sheet1
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/a/local/service-account-key.json
npm start
```

(Locally there's no Cloud Run identity to borrow, so point
`GOOGLE_APPLICATION_CREDENTIALS` at a downloaded key for the same service
account — remember to also share the Sheet with it. Don't commit that key
file; `.gitignore` excludes `.env` but keep the key itself outside the repo
too.)
