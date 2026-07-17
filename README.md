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

## Continuous deployment (recommended)

`.github/workflows/deploy.yml` deploys to Cloud Run automatically on every
push to `main` (or on-demand via the Actions tab's "Run workflow" button).
The one-time setup below is unavoidable — someone has to grant the
permissions once — but after it's done you never touch `gcloud` again; just
`git push`.

It authenticates as a dedicated service account using **Workload Identity
Federation**, so no downloadable key ever leaves Google Cloud.

One-time setup (run once, from your machine or Cloud Shell):

```sh
export PROJECT_ID=your-project-id
export REGION=us-central1
export REPO=michaelpress/try_git   # owner/repo on GitHub
export PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com sheets.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com

# Service account: reads the Sheet at runtime AND deploys via CI
gcloud iam service-accounts create sheet-search \
  --display-name="Sheet Search Cloud Run service"

for role in roles/run.admin roles/iam.serviceAccountUser \
  roles/cloudbuild.builds.editor roles/artifactregistry.writer roles/storage.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:sheet-search@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="$role"
done

# Workload Identity Federation pool + provider, scoped to your GitHub repo
gcloud iam workload-identity-pools create "github" \
  --location="global" --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc "github" \
  --location="global" --workload-identity-pool="github" \
  --display-name="GitHub" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='$REPO'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

gcloud iam service-accounts add-iam-policy-binding \
  "sheet-search@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"

# Print the provider resource name you'll paste into a GitHub secret below
gcloud iam workload-identity-pools providers describe "github" \
  --location="global" --workload-identity-pool="github" \
  --format="value(name)"
```

**Share your Google Sheet** with `sheet-search@$PROJECT_ID.iam.gserviceaccount.com`
as **Viewer**, and grab its Sheet ID from the URL:
`https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

Then in the GitHub repo → **Settings → Secrets and variables → Actions**, add:

| Type | Name | Value |
|---|---|---|
| Secret | `GCP_WIF_PROVIDER` | output of the last command above |
| Secret | `GCP_SERVICE_ACCOUNT` | `sheet-search@your-project-id.iam.gserviceaccount.com` |
| Variable | `GCP_PROJECT_ID` | your-project-id |
| Variable | `GCP_REGION` | e.g. `us-central1` |
| Variable | `SHEET_ID` | your Sheet ID |
| Variable | `SHEET_RANGE` | e.g. `Sheet1` |

Push to `main` (or click **Run workflow** on the Deploy action) and it
deploys. The workflow log prints the `*.run.app` URL.

### Note on access

The workflow deploys with `--allow-unauthenticated`, making the URL reachable
by anyone who has it (no Google login prompt) — that's what keeps "search
from any device" frictionless for a single user. If the Sheet's contents are
sensitive, remove that flag from `.github/workflows/deploy.yml` and instead
grant yourself `roles/run.invoker` and access it via `gcloud run services
proxy` or an authenticated request — at the cost of needing to authenticate
on each device.

## Manual deploy (fallback)

If you'd rather skip CI/CD entirely, you can deploy straight from your
machine any time — this still uses the same `sheet-search` service account
and Sheet setup from above (create the service account and share the Sheet
with it even if you skip the WIF/IAM-role steps, which are CI-only):

```sh
gcloud run deploy sheet-search \
  --source . \
  --region "$REGION" \
  --service-account "sheet-search@$PROJECT_ID.iam.gserviceaccount.com" \
  --set-env-vars SHEET_ID=your-sheet-id,SHEET_RANGE=Sheet1 \
  --allow-unauthenticated
```

`gcloud` builds the container (via Cloud Build) and deploys it, printing a
`*.run.app` URL. Re-run this same command after future code changes.

- `SHEET_RANGE` should name the sheet/tab to read (e.g. `Sheet1`, or
  `Sheet1!A:F` to limit columns). The first row is treated as headers.

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
