# خورشیدکارت · KhorshidCard (Azuri Iran)

Pay-as-you-go, lease-to-own solar kits, built from `49-Azuri_Iran_business_plan_filled.pdf`.

- **Customers:** SMS-code login/sign-up, order a kit, live kit dashboard, charge-card top-up, ownership progress, low-credit alerts, online support.
- **Operations (`/admin`):** KPIs and collection rate, monthly revenue, provinces, customer list with install action, support replies, charge-card batches (CSV).
- `backend/` FastAPI + SQLite · `frontend/` Next.js 16 (fa/en RTL/LTR, light/dark/auto, responsive, mobile tab bar)

## Run locally
```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/uvicorn main:app --port 8049
cd frontend && npm install && npm run dev -- -p 3049        # http://localhost:3049
```
Docker: `docker compose up --build` (web :3049, API :8049/docs, SQLite in the `data` volume).

Demo accounts (with `DEMO=1` the login code is shown on screen): customer `09120000000`, admin `09120000001`.

| env | default | |
|---|---|---|
| `DEMO` | `1` | show login codes, enable demo charge cards. Set `0` in production. |
| `DB_PATH` | `khorshid.db` | SQLite file (seeded with demo data when empty) |
| `COOKIE_SECURE` | `0` | set `1` behind HTTPS |
| `BACKEND_URL` | `http://localhost:8049` | used by Next.js for SSR and the `/api` proxy (build and run time) |

Not wired yet: a real SMS gateway (see `ponytail:` note in `backend/main.py`), payment gateway, IoT device link (telemetry is simulated).

Tests: `cd backend && .venv/bin/pip install pytest httpx && .venv/bin/pytest -q`
