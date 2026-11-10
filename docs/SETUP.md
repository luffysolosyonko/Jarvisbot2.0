# Setup

The tools and accounts Jarvis needs, in order. You do these by hand. The
repo never creates cloud resources for you.

- **Sections 1–4** are everything needed to run Jarvis locally on a Windows
  laptop: the API in Docker and the web app in Chrome. All of it is free.
- **Sections 5–10** are only for deploying the API to Google Cloud Run from
  GitHub Actions.

---

## 1. Local tools (Windows)

1. **Docker Desktop**: <https://www.docker.com/products/docker-desktop/>. Use
   the WSL 2 backend.
2. **Node.js 24 LTS**, from the official installer or a version manager such
   as fnm. Check with `node --version` in a new PowerShell window.
   - If you use fnm and `node` isn't found in a new terminal, add
     `fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression`
     to your PowerShell profile (`notepad $PROFILE`).
3. **Python 3.12** (only to run the API tests outside Docker): the official
   installer, with "Add python.exe to PATH" ticked.
4. **Chrome** for the demo.

## 2. Firebase project (auth)

Firebase Auth works on the free Spark plan; no billing account needed.

1. <https://console.firebase.google.com> > **Create a project** (e.g.
   `jarvis-2`). Google Analytics isn't needed.
2. **Build > Authentication > Get started**. Under **Sign-in method**, enable:
   - **Email/Password**
   - **Google** (optional; set a support email). The web app uses a Firebase
     popup, so there's no client ID to copy.
3. **Authentication > Settings > Authorized domains**: `localhost` is there by
   default. Keep it; the Google popup only works on listed domains.
4. **Project settings > General > Your apps > Add app > Web** (nickname
   `jarvis-web`). Copy `apiKey`, `authDomain`, `projectId` and `appId` into
   `web/.env.local` (section 4). These are public client config, not secrets.
5. Copy the project ID into `FIREBASE_PROJECT_ID` in `api/.env` (section 3).

The demo account is one fixed Firebase UID (`DEMO_UID` in `api/.env`, default
`jarvis-demo`). It signs in with an ordinary email and password, which you set
once the API is running (section 3):

```powershell
docker compose exec api python -m jarvis_api.demo_login --email demo@example.com
```

It prints a generated password (or pass `--password`). Keep it out of the repo.
Re-running it changes the password; the demo data stays attached to the UID.

## 3. Local API configuration

```powershell
cd api
copy .env.example .env
```

Fill in `FIREBASE_PROJECT_ID`. `DATABASE_URL` already points at the Postgres
in `docker-compose.yml`, and `CORS_ORIGINS` already allows the web app on
`http://localhost:5173`.

**Service account key** (needed to set the demo login):

1. Firebase console > **Project settings > Service accounts** > **Generate new
   private key** > **Generate key**.
2. Save the downloaded file as `api/firebase-service-account.json`. It's
   gitignored and excluded from the Docker image. `docker compose` mounts it
   into the API container as a secret.
3. Treat it like a password: don't email it or put it anywhere else. If it
   leaks, delete the key under Google Cloud console > IAM > Service accounts >
   *firebase-adminsdk-…* > Keys.

`docker compose up` needs this file to exist.

`ANTHROPIC_API_KEY` is optional. Without it everything works except Ask mode,
which shows a clear "not configured" error. Logging never uses it. To enable
Ask, create a key at <https://console.anthropic.com> > API keys and set a
monthly spend limit under Billing > Limits. `ASK_DEMO_DAILY_TOKEN_CAP` limits
what the demo account can spend per day (one question uses about 4,000 tokens).

Start the API and seed the demo account:

```powershell
docker compose up -d --build
docker compose exec api python -m jarvis_api.seed
```

Turn on Firebase's password policy (new passwords need 12+ characters with an uppercase
letter, a lowercase letter, a number and a symbol; existing
ones keep working). Run it once per Firebase project; without `--apply` it
shows the current policy:

```powershell
docker compose exec api python -m jarvis_api.password_policy --apply
```

The database is published on host port 15432 (not 5432) so it never collides
with a Postgres installed on the laptop; set `JARVIS_DB_PORT` to change it.

## 4. Web app

```powershell
cd web
copy .env.example .env.local     # then paste the Firebase web config from section 2
npm install
npm run dev                      # http://localhost:5173
```

`VITE_API_URL` defaults to `http://localhost:8000`. The dev server always uses
port 5173 (it fails rather than pick another), because that's the origin the
API allows. Other commands: `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build`.

The day-of-demo steps are in [DEMO.md](DEMO.md).

---

## Cloud deployment (optional)

Placeholders used below:

| Placeholder | Example |
|---|---|
| `PROJECT_ID` | the Firebase project ID from section 2 (same GCP project) |
| `PROJECT_NUMBER` | shown on the GCP project dashboard |
| `REGION` | `us-central1` |
| `GITHUB_REPO` | `your-user/jarvis-2` |

Cloud Run, Artifact Registry, Secret Manager and Neon have free tiers that
cover a portfolio app, but GCP requires a billing account. Set a budget alert
(5.3).

## 5. Google Cloud project

1. The Firebase project is already a GCP project. Open it at
   <https://console.cloud.google.com> and note `PROJECT_NUMBER`.
2. Link a billing account (**Billing > Link a billing account**).
3. **Billing > Budgets & alerts > Create budget**: e.g. $5/month with email
   alerts at 50%, 90% and 100%.
4. Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install), then:

   ```bash
   gcloud auth login
   gcloud config set project PROJECT_ID
   gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
     secretmanager.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
   gcloud artifacts repositories create jarvis \
     --repository-format=docker --location=REGION
   ```

## 6. Neon Postgres

1. Sign up at <https://neon.tech> and create a project (a region near
   `REGION`) with database `jarvis`.
2. Copy the **pooled** connection string. Change the scheme to
   `postgresql+psycopg://` and keep `?sslmode=require`.

## 7. Secret Manager

```bash
printf '%s' 'postgresql+psycopg://...'  | gcloud secrets create DATABASE_URL --data-file=-
printf '%s' 'sk-ant-...'                | gcloud secrets create ANTHROPIC_API_KEY --data-file=-
openssl rand -hex 32 | tr -d '\n'       | gcloud secrets create DEMO_RESET_TOKEN --data-file=-
```

## 8. Service accounts

A **runtime** account that Cloud Run runs as, and a **deployer** account that
GitHub Actions impersonates. Don't create JSON keys for either.

```bash
gcloud iam service-accounts create jarvis-runtime --display-name="Jarvis API runtime"
gcloud iam service-accounts create jarvis-deployer --display-name="Jarvis GitHub deployer"

RUNTIME=jarvis-runtime@PROJECT_ID.iam.gserviceaccount.com
DEPLOYER=jarvis-deployer@PROJECT_ID.iam.gserviceaccount.com

# Runtime: read secrets. (Verifying Firebase ID tokens uses Google's public
# signing keys and needs no IAM role.)
for s in DATABASE_URL ANTHROPIC_API_KEY DEMO_RESET_TOKEN; do
  gcloud secrets add-iam-policy-binding $s \
    --member="serviceAccount:$RUNTIME" --role=roles/secretmanager.secretAccessor
done

# Deployer: push images, deploy Cloud Run, act as the runtime account,
# and read DATABASE_URL to run migrations
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:$DEPLOYER" --role=roles/run.admin
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:$DEPLOYER" --role=roles/artifactregistry.writer
gcloud iam service-accounts add-iam-policy-binding $RUNTIME \
  --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser
gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member="serviceAccount:$DEPLOYER" --role=roles/secretmanager.secretAccessor
```

## 9. Workload Identity Federation for GitHub Actions

```bash
gcloud iam workload-identity-pools create github \
  --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc jarvis-repo \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='GITHUB_REPO' && assertion.ref=='refs/heads/main'"

gcloud iam service-accounts add-iam-policy-binding $DEPLOYER \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/GITHUB_REPO"
```

The attribute condition means only `main` of your repo can deploy.

## 10. GitHub repository settings

**Settings > Secrets and variables > Actions > Variables** (none of these are
secret):

| Name | Value |
|---|---|
| `GCP_PROJECT_ID` | `PROJECT_ID` |
| `GCP_REGION` | `REGION` |
| `GCP_WIF_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/jarvis-repo` |
| `GCP_DEPLOYER_SA` | `jarvis-deployer@PROJECT_ID.iam.gserviceaccount.com` |
| `GCP_RUNTIME_SA` | `jarvis-runtime@PROJECT_ID.iam.gserviceaccount.com` |

Add a branch protection rule on `main` that requires the CI checks.
