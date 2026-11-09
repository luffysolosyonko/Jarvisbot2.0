# Demo checklist

A screen-shared demo on a Windows laptop with the Android emulator. One-time
setup is in [SETUP.md](SETUP.md) sections 1–5.

## The day before

- [ ] `git pull` and run the tests (README > Test) so you know the build is green.
- [ ] Run through the whole script below once.
- [ ] Turn off Windows notifications (Focus assist) and close other apps.

## 15 minutes before

Run every command from the repo root unless it says otherwise. Use PowerShell.

1. [ ] **Start Docker Desktop.** Wait until the status bar says *Engine
   running*.
2. [ ] **Start the stack:**

   ```powershell
   docker compose up -d --build
   ```

   Check that <http://localhost:8000/healthz> returns `{"status":"ok"}`.
3. [ ] **Reset and seed the demo account** with 12 weeks of made-up history:

   ```powershell
   docker compose exec api python -m jarvis_api.seed
   ```

4. [ ] **Boot the emulator:** Android Studio > Virtual Device Manager > ▶ on
   the Google Play device. Then check that `adb devices` lists `emulator-5554
   device`.
5. [ ] **Launch the app:**

   ```powershell
   cd app
   npx expo run:android
   ```

   The first build takes a few minutes; after that it's quick. Leave Metro
   running.
6. [ ] **Sign in:** tap **Try the demo**. The dashboard should show charts.
7. [ ] Set the emulator to the theme you want to present (Settings > Display >
   Dark theme). The app follows it.

## 5-minute script

| Time | Screen | Do | Point out |
|---|---|---|---|
| 0:00 | Sign in | Show the form, then tap **Try the demo** | Email/password and Google via Firebase. The API verifies the Firebase ID token on every request. |
| 0:30 | Dashboard | Scroll top to bottom | Today's summary, weekly sets and volume, body weight with a 7-day average and a dashed projection, top lifts with e1RM change. Everything is computed from raw logs on read. |
| 1:30 | Log | Type `5x 155lb 2x1x1xf bench` slowly | The preview updates as you type and splits one line into sets. Show the failed-rep flag and the matched exercise. |
| 2:00 | Log | Add a line `8x 70/80kg squat`, then **Save** | The estimated flag, kg converted to lb, and the new entry in today's logs. |
| 2:30 | Exercise detail | Dashboard > Top lifts > **Bench** | The e1RM chart with its dashed forecast, best and heaviest sets, rep targets. Enter a target such as `225` to get a projected date. Today's 155 lb set is the newest point, and a new best. |
| 3:30 | History | Scroll back a few days | Raw text above its parsed rows. The raw text is the source of truth; parsed rows can be rebuilt when the parser improves. |
| 4:00 | Ask Jarvis | Ask "How is my bench trending?" | The answer uses only your own data, with a tokens-used line and a daily cap. Claude sits behind a swappable provider interface. |
| 4:30 | Settings | Switch units to kg and back; show the time zone | Everything is stored in lb and converted for display. Sign out. |

If there's time for questions, the strongest code to show: the `jarvis_core`
parser tests, the test proving user A can't read user B's data, and the
design-token contrast test.

## If something goes wrong

| Symptom | Fix |
|---|---|
| App says it can't reach the server | Open `http://10.0.2.2:8000/healthz` in the emulator's Chrome. If that fails, check `docker compose ps`; the `api` container must be up and on port 8000. |
| Ask Jarvis shows "not configured" or a timeout | Expected without `ANTHROPIC_API_KEY` in `api/.env`, or if the request takes more than 15 seconds. Move on; the rest of the app doesn't depend on it. |
| Charts are empty | Re-run the seed command (step 3) and pull to refresh. |
| Port 15432 or 8000 already in use | Stop whatever holds it, or set `JARVIS_DB_PORT` to another port (and match `DATABASE_URL` in `api/.env`). Then `docker compose down` and up again. |
| Red screen or stale bundle | In the Metro terminal press `r` to reload. If it persists, stop Metro and run `npx expo start --clear`. |
| "Continue with Google" fails | Use **Try the demo** or email sign-in. To fix it later, see SETUP.md section 4. |

## After the demo

```powershell
docker compose exec api python -m jarvis_api.seed   # restore the demo data
docker compose down
```
