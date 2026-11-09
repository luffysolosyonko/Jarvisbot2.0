# Demo checklist

A screen-shared demo of the web app in Chrome on a Windows laptop. One-time
setup is in [SETUP.md](SETUP.md) sections 1–4.

## The day before

- [ ] `git pull` and run the tests (README > Test) so you know the build is green.
- [ ] Run through the whole script below once.
- [ ] Turn off Windows notifications (Focus assist) and close other apps.

## 10 minutes before

Run every command from the repo root unless it says otherwise. Use PowerShell.

1. [ ] **Start Docker Desktop.** Wait until the status bar says *Engine
   running*.
2. [ ] **Start the API and database:**

   ```powershell
   docker compose up -d --build
   ```

   Check that <http://localhost:8000/healthz> returns `{"status":"ok"}`.
3. [ ] **Reset and seed the demo account** with 12 weeks of made-up history:

   ```powershell
   docker compose exec api python -m jarvis_api.seed
   ```

4. [ ] **Start the web app** in a second PowerShell window:

   ```powershell
   cd web
   npm run dev
   ```

   Leave it running. It serves <http://localhost:5173>.
5. [ ] **Open Chrome** at <http://localhost:5173> and click **Try the demo**.
   The Notebook should show the last two weeks of entries.
6. [ ] Zoom the browser to 110–125% (Ctrl +) so text reads well over screen
   share.
7. [ ] Clear the input, switch to **Workout** mode, close any open tool panel.

## 5-minute script

| Time | Where | Do | Point out |
|---|---|---|---|
| 0:00 | Sign in | Show the form, then click **Try the demo** | Email, Google popup and the demo all go through Firebase. The demo is a custom token for one fixed account, minted by the API; there's no demo password. |
| 0:30 | Notebook | Scroll the page | A ruled logbook: the time in the margin, what was typed in mono, and a green "↳" note of what it logged. Click a note for the parsed sets. |
| 1:00 | Notebook, Workout | Type `5x 155lb 2x1x1xf bench`, then press Enter | The "↳" line under the box reads it back as the note it will get, with "✗ last rep" for the failed rep. Enter saves and it appears at once. No AI is involved in logging. |
| 1:30 | Notebook, Workout | Type `8x 135lb bench`, Shift+Enter, then `8 135 squat` | The bad line is flagged "Not understood" with fixes; click **Add unit: lb** and it's rewritten and re-parsed. **Tools > Syntax help** has every format and the keyboard shortcuts. |
| 2:00 | Notebook, Weight | Switch to **Weight**, type `83.9kg`, Enter; then type `90`, Enter | Converted to 185 lb. A bare `90` reads as 90 kg = 198.4 lb, about 19 lb over the 7-day average, so it gets a warning box: **It was 90 lb**, **Keep 198.4** or **Edit**. Until you answer, it's left out of every average and forecast. |
| 2:30 | Tools | **Tools > Predict lift**, pick **Bench**, target `225`, **Get date** | Every slash command is in the Tools menu (wrench), with dropdowns instead of typed syntax. The forecast is a regression over recent sessions, with the date you'd hit the target at this pace. |
| 3:15 | History | Click a dark day in the heatmap | Darker = more sets, a dot = a weigh-in. The day shows as one table of every set (exercise, "3 ✓ · 1 ✗", weight) and the weigh-in. |
| 3:45 | Progress | Scroll; click **Bench** | The latest confirmed weigh-in up top, then body weight with a 7-day average and a dashed forecast (the flagged `90` from earlier is a hollow orange circle, pinned at the top), this week's sets, volume and sessions, and top lifts. Bench shows the deload dip and the forecast line. |
| 4:15 | Notebook, Ask | Press **Ask**, ask "Is my bench still improving?" | Only Ask mode calls Claude. The answer uses only this account's data and appears as a message from Jarvis. It's saved: reload and it's still there; **Tools > Hide answers** hides it. |

If there's time for questions, the strongest code to show: the `jarvis_core`
parser tests, the test that logging makes zero LLM calls
(`api/tests/api/test_notebook.py`), the fix suggestions
(`api/jarvis_api/services/fixes.py`), the test proving user A can't read user
B's data, and the design-token contrast test.

## If something goes wrong

| Symptom | Fix |
|---|---|
| "Can't reach the server" | Open <http://localhost:8000/healthz>. If that fails, check `docker compose ps`; the `api` container must be up on port 8000. |
| Sign-in or the API fails with a CORS error in the console | The web app must be on exactly `http://localhost:5173` (not 127.0.0.1). `CORS_ORIGINS` in `api/.env` must include it; restart with `docker compose up -d`. |
| Ask shows "not configured" or a timeout | Expected without `ANTHROPIC_API_KEY` in `api/.env`, or if a request takes more than 15 seconds. Move on; nothing else depends on it. |
| Ask says today's allowance is used | Raise `ASK_DEMO_DAILY_TOKEN_CAP` in `api/.env` and run `docker compose up -d`. |
| Charts or the calendar are empty | Re-run the seed command (step 3) and reload the page. |
| Port 15432 or 8000 already in use | Stop whatever holds it, or set `JARVIS_DB_PORT` to another port. Then `docker compose down` and up again. |
| Port 5173 already in use | Close the other `npm run dev` window (the port is fixed because the API's CORS allows only it). |
| "Continue with Google" fails | Use **Try the demo** or email sign-in. See SETUP.md section 3 for enabling Google. |

## After the demo

```powershell
docker compose exec api python -m jarvis_api.seed   # restore the demo data
docker compose down
```
