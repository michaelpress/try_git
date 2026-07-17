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

## Deploy — Cloud Console only, no terminal

Cloud Run can watch your GitHub repo and auto-build/deploy on every push,
set up entirely by clicking through the Console. One-time setup:

1. Go to **[console.cloud.google.com/run](https://console.cloud.google.com/run)**
   → **Create service**.
2. Choose **"Continuously deploy from a repository (source or function)"** →
   **Set up with Cloud Build**.
3. Click **Connect Repository** → **GitHub** → sign in and authorize the
   **Google Cloud Build** GitHub App → pick `michaelpress/try_git` → Install.
4. Select the repo, click **Next**. Set:
   - **Branch**: `^main$` (or whichever branch you want to deploy from)
   - **Build type**: Dockerfile
   - **Dockerfile location**: `/Dockerfile`
   → **Save**.
5. Back on the Create Service screen, set:
   - **Service name**: `sheet-search`
   - **Region**: pick one close to you
   - **Authentication**: **Allow unauthenticated invocations** (so you can
     open it from any device without a Google login prompt)
6. Expand **Container(s), Volumes, Networking, Security**:
   - **Container** tab → **Variables & Secrets** → **Add variable** twice:
     - `SHEET_ID` = your Sheet's ID
     - `SHEET_RANGE` = e.g. `Sheet1`
   - **Security** tab → **Service account** → create a new one (e.g.
     `sheet-search`) or pick an existing one. This is the identity that
     reads your Sheet at runtime.
7. Click **Create**. Cloud Build runs the first build/deploy; the service
   URL (`*.run.app`) appears on the service page when it's done.

From now on, every push to that branch triggers an automatic rebuild and
redeploy — nothing further to click or run.

### Share the Sheet

Open your Google Sheet → **Share** → add the runtime service account's email
(shown on the Cloud Run service's **Security** tab, something like
`sheet-search@your-project-id.iam.gserviceaccount.com`) as **Viewer**. Grab
the Sheet ID from its URL: `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`.

If you added the env vars in step 6 before you had the Sheet ID, edit the
service afterward: **Cloud Run → sheet-search → Edit & Deploy New Revision →
Variables & Secrets**.

### Note on access

"Allow unauthenticated invocations" makes the URL reachable by anyone who has
it (no Google login prompt) — that's what keeps "search from any device"
frictionless for a single user. If the Sheet's contents are sensitive,
instead choose "Require authentication" in step 5 and grant yourself the
**Cloud Run Invoker** role on the service (Security tab → Permissions) — at
the cost of needing to authenticate on each device.

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
too. To get a key: Console → **IAM & Admin → Service Accounts** → your
account → **Keys** → **Add key**.)
