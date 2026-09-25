# AUTOMAT HR MIS & Workforce Management System

A full-stack HR MIS: **React** frontend, **Node.js/Express** backend, **PostgreSQL** database.
Role-based access control, 12 HR/plant modules, live dashboard KPIs, and a full audit trail.

```
automat-hr-mis/
├── backend/    Express API + PostgreSQL schema
└── frontend/   React (Vite) app
```

---

## 1. Prerequisites

Install these once on your machine:
- **Node.js** 18+ and npm — https://nodejs.org
- **PostgreSQL** 14+ — https://www.postgresql.org/download/

Check they're installed:
```bash
node -v
npm -v
psql --version
```

---

## 2. Create the database

```bash
# Open the Postgres shell (adjust user if needed)
psql -U postgres

# Inside psql:
CREATE DATABASE automat_hr_mis;
CREATE USER automat_user WITH PASSWORD 'automat_pass';
GRANT ALL PRIVILEGES ON DATABASE automat_hr_mis TO automat_user;
\q
```

Load the schema (all tables):
```bash
psql -U automat_user -d automat_hr_mis -f backend/schema.sql
```

(Optional) Load sample business data so the dashboard has something to show:
```bash
psql -U automat_user -d automat_hr_mis -f backend/seed.sql
```

---

## 3. Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and set:
- `DATABASE_URL` — your Postgres connection string
- `JWT_SECRET` — replace with a long random string (e.g. `openssl rand -hex 32`)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — the first login you'll create

Create your first Administrator login:
```bash
npm run create-admin
```
This prints the email/password to use for sign-in.

Start the API:
```bash
npm run dev      # auto-restarts on changes (needs devDependency nodemon, already installed)
# or
npm start        # plain node
```

The API runs at `http://localhost:4000`. Confirm it's alive:
```bash
curl http://localhost:4000/api/health
```

---

## 4. Frontend setup

Open a **second terminal**:
```bash
cd frontend
npm install
cp .env.example .env
```

`VITE_API_BASE_URL` in `.env` should point at your backend (default `http://localhost:4000/api` — leave as-is for local dev).

Start the frontend:
```bash
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`) and sign in with the admin email/password from step 3.

---

## 5. Sign-up and roles

**Anyone can sign up.** The login screen has a **Sign up** tab — name, email, password — no role picker exists there on purpose. Every self-signup automatically gets the **Viewer** role: read-only access to every module. This is enforced in `backend/src/routes/auth.js` — the `/api/auth/register` endpoint hardcodes `role = 'Viewer'` in the SQL itself, so even a request crafted to send `"role": "Administrator"` is ignored.

**Only an Administrator can create or promote privileged accounts.** In the app, go to **User Management** → **Add record** (or edit an existing self-signed-up user) and assign a role. Two things enforce this beyond the UI:
- `canEdit('usersmgmt')` in `backend/src/config/roles.js` returns `true` only for the `Administrator` role — HR Manager and everyone else can *view* the user list but not *change* it.
- The role dropdown itself only offers `ASSIGNABLE_ROLES` (every role except `Viewer`), and the backend independently re-checks this on every create/update to `usersmgmt` — so `Viewer` can never be hand-assigned, even by an Administrator, even via a raw API call.

**The Administrator account is pre-created and never comes from signup.** It only exists via `npm run create-admin` (see step 3), which talks directly to the database using your `.env` credentials — there is no code path from the public signup form to an Administrator or any other privileged role.

Roles are modelled after how a multi-plant manufacturer like Automat actually organizes HR and plant operations:

| Role | Sees | Can add/edit/delete | How it's granted |
|---|---|---|---|
| **Administrator** | Everything, including Audit Trail | Everything | `npm run create-admin` only |
| **HR Manager** | Everything | Manpower, Recruitment, Hiring, Separation, Loans, Retirement, Health Check, Engagement, Attendance — not User Management, not Audit Trail | Admin-assigned |
| **Plant Head** | Dashboard, Manpower, Attendance, Engagement, Health Check, Retirement | Manpower, Attendance, Engagement, Health Check | Admin-assigned |
| **Recruiter** | Dashboard, Recruitment, Hiring | Recruitment, Hiring | Admin-assigned |
| **Finance & Accounts** | Dashboard, Employee Loans, Electricity, Canteen | Loans, Electricity, Canteen | Admin-assigned |
| **Plant Operations** (e.g. Electricity Officer) | Dashboard, Electricity, Canteen, Attendance | Electricity, Canteen, Attendance | Admin-assigned |
| **Management** | Everything (for directors/owners) | Nothing — read-only | Admin-assigned |
| **Viewer** | Everything | Nothing — read-only | Public self-signup only, never assignable |

Audit Trail is always read-only for everyone who can see it.

Every create/update/delete is written to the **Audit Trail** automatically.

---

## 6. Deploying it for real use

This is close to production-ready but do these before going live with real employee data:
- **HTTPS everywhere** — put the API behind a reverse proxy (Nginx/Caddy) or a platform that provides TLS (Render, Railway, Fly.io).
- **Managed Postgres** — use a managed database (Render/Railway/AWS RDS/Supabase) instead of a self-hosted one, with automated backups.
- **Strong `JWT_SECRET`** and a short `JWT_EXPIRES_IN` (the example uses 8h).
- **Rate limiting** on `/api/auth/login` and `/api/auth/register` (e.g. `express-rate-limit`) to slow down password guessing and signup spam.
- **CORS_ORIGIN** in backend `.env` — set to your real frontend domain, not `*`.
- Consider **refresh tokens** or shorter-lived JWTs plus re-login for higher-security environments.
- Review the RBAC map in `backend/src/config/roles.js` against your actual org policy before onboarding real staff.

---

## 7. How it's built (for whoever maintains this next)

- **Generic CRUD**: every module (Manpower, Recruitment, Loans, etc.) is driven by one config file — `backend/src/config/modules.js` on the server and `frontend/src/config.js` on the client — mapping each module to its table/columns/form fields. Adding a new module is config, not new route code: add an entry to both config files and a `CREATE TABLE` in `schema.sql`.
- **RBAC**: `backend/src/config/roles.js` is enforced server-side on every request (never trust the frontend alone). The frontend mirrors it only to hide/show UI — the real enforcement is in the API.
- **Audit trail**: every Create/Update/Delete writes a row to `audit_log` inside the same DB transaction as the change, so it can never go out of sync.
- **Dashboard**: `backend/src/routes/dashboard.js` computes all KPIs server-side with SQL aggregation, so the frontend just renders numbers — no heavy client-side computation.
