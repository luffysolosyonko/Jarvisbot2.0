# Setup

The tools and accounts Jarvis needs, in order. You do these by hand. The
repo never creates cloud resources for you.

- **Sections 1–5** are everything needed to run Jarvis locally on a Windows
  laptop with the Android emulator. All of it is free.
- **Sections 6–11** are only for deploying the API to Google Cloud Run from
  GitHub Actions.

---

## 1. Local tools (Windows)

1. **Docker Desktop**: <https://www.docker.com/products/docker-desktop/>. Use
   the WSL 2 backend.
2. **Node.js 20 LTS or newer** and **Python 3.12**: both from their official
   installers. Tick "Add python.exe to PATH".
3. **Android Studio**: <https://developer.android.com/studio>. It bundles the
   JDK that Gradle needs.
4. Set user environment variables (Start > "Edit environment variables for
   your account"):

   | Variable | Value |
   |---|---|
   | `ANDROID_HOME` | `%LOCALAPPDATA%\Android\Sdk` |
   | `JAVA_HOME` | `C:\Program Files\Android\Android Studio\jbr` |
   | `Path` (append) | `%ANDROID_HOME%\platform-tools` and `%ANDROID_HOME%\emulator` |

   Open a new terminal and check that `adb --version` and `java -version` work.

## 2. Android emulator (Google Play image)

Google sign-in needs Google Play services, so use a **Google Play** image, not
a plain "Google APIs" or AOSP one.

1. Android Studio > **More Actions** > **Virtual Device Manager** > **Create
   device**.
2. Pick a phone with the Play Store icon in the "Play Store" column (e.g.
   **Pixel 8**).
3. Choose a system image whose target says **Google Play** (API 35 or newer,
   x86_64). Download it if needed.
4. Finish, then start it with ▶. Open the Play Store once and sign in with a
   Google account. Use a test account if you like; it's the account you'll pick
   when you tap "Continue with Google".

## 3. Firebase project (auth)

Firebase Auth works on the free Spark plan; no billing account needed.

1. <https://console.firebase.google.com> > **Create a project** (e.g.
   `jarvis-2`). Google Analytics isn't needed.
2. **Build > Authentication > Get started**. Under **Sign-in method**, enable:
   - **Email/Password**
   - **Google** (set a support email). This also creates a **Web client** OAuth
     ID that you'll need in section 4.
3. **Project settings > General > Your apps**:
   - Add a **Web app** (nickname `jarvis-app`). Copy `apiKey`, `authDomain`,
     `projectId` and `appId` into `app/.env.local` (see `app/.env.example`).
     These are public client config, not secrets.
   - Add an **Android app** with package name `com.luffysolosyonko.jarvis`
     (must match `android.package` in `app/app.json`). Skip the SHA-1 for now
     (section 4) and skip downloading `google-services.json`.
4. Copy the project ID into `FIREBASE_PROJECT_ID` in `api/.env`.

There's no demo user to create and no demo password. "Try the demo" asks the
API for a Firebase custom token for one fixed UID (`DEMO_UID` in `api/.env`,
default `jarvis-demo`). Firebase creates that user on its first sign-in. The
UID comes only from server config, never from the request.

Email sign-in and "Try the demo" work once this section and section 5 are
done. Section 4 is only needed for "Continue with Google".

## 4. Google sign-in on the emulator (optional)

Google checks that the app is signed with a key registered in Firebase. Local
dev builds are signed with the debug keystore, so register its SHA-1.

1. Build the app once so the `android/` folder exists:

   ```powershell
   cd app
   npx expo run:android
   ```

2. Print the signing certificates:

   ```powershell
   cd android
   .\gradlew signingReport        # Git Bash: ./gradlew signingReport
   ```

   Find the block with `Variant: debug` and `Config: debug`, and copy its
   `SHA1` line (format `AB:CD:...`).
3. Firebase console > **Project settings > General > Your apps > Android app**
   > **Add fingerprint**, paste the SHA-1 and save.
4. **Authentication > Sign-in method > Google > Web SDK configuration**: copy
   the **Web client ID** into `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in
   `app/.env.local`.
5. Rebuild: `npx expo run:android`.

`android/` is generated and gitignored. Regenerating it (`npx expo prebuild
--clean`) keeps the same debug keystore, so the SHA-1 doesn't change. If it
ever does, repeat steps 2–3.

## 5. Local API configuration

```powershell
cd api
copy .env.example .env
```

Fill in `FIREBASE_PROJECT_ID`. `DATABASE_URL` already points at the Postgres
in `docker-compose.yml`.

**Service account key** (needed to mint "Try the demo" tokens):

1. Firebase console > **Project settings > Service accounts** > **Generate new
   private key** > **Generate key**.
2. Save the downloaded file as `api/firebase-service-account.json`. It's
   gitignored and excluded from the Docker image. `docker compose` mounts it
   into the API container as a secret. `GOOGLE_APPLICATION_CREDENTIALS` in
   `api/.env` already points at it.
3. Treat it like a password: don't email it or put it anywhere else. If it
   leaks, delete the key under Google Cloud console > IAM > Service accounts >
   *firebase-adminsdk-…* > Keys.

`docker compose up` needs this file to exist. Without it, run the API with
`uvicorn` instead (README > Run locally); email sign-in still works and only
"Try the demo" is unavailable.

`ANTHROPIC_API_KEY` is optional. Without it everything works except Ask
Jarvis, which shows a clear "not configured" error. To enable it, create a key
at <https://console.anthropic.com> > API keys, and set a monthly spend limit
under Billing > Limits.

The day-of-demo steps are in [DEMO.md](DEMO.md).

---

## Cloud deployment (optional)

Placeholders used below:

| Placeholder | Example |
|---|---|
| `PROJECT_ID` | the Firebase project ID from section 3 (same GCP project) |
| `PROJECT_NUMBER` | shown on the GCP project dashboard |
| `REGION` | `us-central1` |
| `GITHUB_REPO` | `your-user/jarvis-2` |

Cloud Run, Artifact Registry, Secret Manager and Neon have free tiers that
cover a portfolio app, but GCP requires a billing account. Set a budget alert
(6.3).

## 6. Google Cloud project

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

## 7. Neon Postgres

1. Sign up at <https://neon.tech> and create a project (a region near
   `REGION`) with database `jarvis`.
2. Copy the **pooled** connection string. Change the scheme to
   `postgresql+psycopg://` and keep `?sslmode=require`.

## 8. Secret Manager

```bash
printf '%s' 'postgresql+psycopg://...'  | gcloud secrets create DATABASE_URL --data-file=-
printf '%s' 'sk-ant-...'                | gcloud secrets create ANTHROPIC_API_KEY --data-file=-
openssl rand -hex 32 | tr -d '\n'       | gcloud secrets create DEMO_RESET_TOKEN --data-file=-
```

## 9. Service accounts

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

## 10. Workload Identity Federation for GitHub Actions

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

## 11. GitHub repository settings

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
