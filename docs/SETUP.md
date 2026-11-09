# Setup

The cloud and account steps Jarvis needs, in order. You do these by hand. The
repo never creates cloud resources for you.

Placeholders used below:

| Placeholder | Example |
|---|---|
| `PROJECT_ID` | `jarvis-2-prod` |
| `REGION` | `us-central1` |
| `GITHUB_REPO` | `your-user/jarvis-2` |
| `PROJECT_NUMBER` | shown on the GCP project dashboard |

Cost notes: Cloud Run, Artifact Registry, Secret Manager, Firebase Auth (Spark)
and Neon all have free tiers that cover a portfolio app. GCP still requires a
billing account, so set a budget alert (step 1.3). The Apple Developer Program
($99/year) and Google Play Console ($25 one time) are the only paid items, and
you only need them for TestFlight and Play internal testing.

---

## 0. Local development (no cloud needed)

You can run the API and its tests without any accounts.

```bash
# Optional local Postgres (tests can also use SQLite)
docker run --name jarvis-pg -e POSTGRES_USER=jarvis -e POSTGRES_PASSWORD=jarvis \
  -e POSTGRES_DB=jarvis -p 5432:5432 -d postgres:16
```

Then follow "Run locally" in the [README](../README.md).

---

## 1. Google Cloud project

1. Create a project at <https://console.cloud.google.com/projectcreate>. Note
   its `PROJECT_ID` and `PROJECT_NUMBER`.
2. Link a billing account (Billing > Link a billing account).
3. Billing > Budgets & alerts > Create budget: e.g. $5/month with email alerts
   at 50%, 90% and 100%.
4. Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install), then:

   ```bash
   gcloud auth login
   gcloud config set project PROJECT_ID
   gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
     secretmanager.googleapis.com iamcredentials.googleapis.com \
     sts.googleapis.com cloudbuild.googleapis.com
   ```

5. Create the Docker repository:

   ```bash
   gcloud artifacts repositories create jarvis \
     --repository-format=docker --location=REGION
   ```

## 2. Firebase Auth (same GCP project)

1. Go to <https://console.firebase.google.com>, choose **Add project**, and
   pick the existing `PROJECT_ID`. Google Analytics isn't needed.
2. Build > Authentication > Get started. Under **Sign-in method**, enable
   - **Email/Password**
   - **Google** (set a support email)
3. Project settings > General > **Your apps**: add a **Web app** (nickname
   `jarvis-app`). Copy `apiKey`, `authDomain`, `projectId` and `appId` into
   `app/.env.local` (see `app/.env.example`). These values are public client
   config, not secrets.
4. Also add an **iOS app** (bundle ID e.g. `com.yourname.jarvis`) and an
   **Android app** (package e.g. `com.yourname.jarvis`). Use the same IDs later
   in `app.json`.
5. Create the demo user: Authentication > Users > Add user, email
   `demo@example.com` with a long random password. It only ever holds made-up
   data, and the API resets it nightly.

## 3. Google sign-in OAuth clients

Google Cloud console > APIs & Services > Credentials. Firebase already created
a **Web client**; copy its client ID to `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

Create OAuth client IDs:

- **iOS**: bundle ID from step 2.4 → `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
- **Android**: package name from step 2.4, plus the SHA-1 of the signing key.
  Get it after the first EAS build with `npx eas-cli@latest credentials`
  (Android > select the build profile > Keystore). Put the ID in
  `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`. If you use Play App Signing, add a
  second Android client with the Play signing SHA-1 as well.

Configure the OAuth consent screen (External, testing mode is fine) and add
yourself and any reviewers as test users.

## 4. Neon Postgres

1. Sign up at <https://neon.tech> and create a project (region close to
   `REGION`, e.g. AWS us-east-1 for us-central1) with database `jarvis`.
2. Copy the **pooled** connection string. Change the scheme to
   `postgresql+psycopg://` and keep `?sslmode=require`.
3. Store it in Secret Manager (step 6). Never put it in a committed file.

## 5. Anthropic API key

1. Create a key at <https://console.anthropic.com> > API keys.
2. Set a monthly spend limit in the console (Billing > Limits).
3. Store it in Secret Manager (step 6).

## 6. Secret Manager

```bash
printf '%s' 'postgresql+psycopg://...'  | gcloud secrets create DATABASE_URL --data-file=-
printf '%s' 'sk-ant-...'                | gcloud secrets create ANTHROPIC_API_KEY --data-file=-
openssl rand -hex 32 | tr -d '\n'       | gcloud secrets create DEMO_RESET_TOKEN --data-file=-
```

## 7. Service accounts

A **runtime** account that Cloud Run runs as, and a **deployer** account that
GitHub Actions impersonates.

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

Don't create JSON keys for either account.

## 8. Workload Identity Federation for GitHub Actions

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

## 9. GitHub repository settings

Settings > Secrets and variables > Actions.

**Variables** (not secret):

| Name | Value |
|---|---|
| `GCP_PROJECT_ID` | `PROJECT_ID` |
| `GCP_REGION` | `REGION` |
| `GCP_WIF_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/jarvis-repo` |
| `GCP_DEPLOYER_SA` | `jarvis-deployer@PROJECT_ID.iam.gserviceaccount.com` |
| `GCP_RUNTIME_SA` | `jarvis-runtime@PROJECT_ID.iam.gserviceaccount.com` |

**Secrets**:

| Name | Value |
|---|---|
| `EXPO_TOKEN` | Expo access token (step 10), only for EAS jobs |

Also add a branch protection rule on `main` that requires the CI checks.

## 10. Expo / EAS

1. Create an account at <https://expo.dev>.
2. In `app/`: `npx eas-cli@latest login`, then `npx eas-cli@latest init` (this
   links the project and writes `extra.eas.projectId` into `app.json`).
3. Expo > Account settings > Access tokens: create a token for GitHub
   (`EXPO_TOKEN`).
4. Store the app's public env values as EAS environment variables
   (`npx eas-cli@latest env:create`) for the `preview` and `production`
   environments.

## 11. Store accounts (only for TestFlight / Play internal testing)

- **Apple**: join the Apple Developer Program ($99/year). Create the app in App
  Store Connect with the bundle ID from step 2.4. `eas submit -p ios` uses an
  App Store Connect API key, which EAS can create for you on first submit.
- **Google Play**: create a Play Console account ($25). Create the app, then
  upload the first AAB by hand (Play requires this once). After that,
  `eas submit -p android` needs a Google service account key with the
  Play Console "Release manager" permission. Store it in EAS credentials,
  never in this repo.
