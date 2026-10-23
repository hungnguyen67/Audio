# Audio Story Reader

## Run locally on Windows (without Docker)

Prerequisites: Python, Node.js/npm, and a local MySQL server. The database
connection defaults are in `backend/app/core/config.py`. Initialize a fresh
database with `backend/migrations/001_init.sql`; apply
`backend/migrations/002_migration.sql` only when upgrading an older database.

From the repository root, create the Python environment and install backend
dependencies once:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt
```

Install frontend dependencies once:

```powershell
cd .\frontend
npm ci
cd ..
```

Start both services with one command from the repository root:

```powershell
.\start-local.ps1
```

The script checks Python/npm, dependencies, and the MySQL connection, then
opens separate PowerShell windows for the backend and frontend. Keep those
windows open while using the app. If PowerShell blocks script execution, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

Open `http://127.0.0.1:3000`. The backend listens at
`http://127.0.0.1:3001`.

## Docker

Docker Compose runs the frontend, Python HTTP backend, and MariaDB database.
The database is initialized from `backend/migrations/001_init.sql` on its first
start and stored in the `mysql_data` volume. The `002_migration.sql` script is
for upgrading older existing databases; it is not needed for a fresh database.

1. Copy `.env.example` to `.env` and replace both placeholder passwords with
   strong values.
2. Run `docker compose up --build`.
3. Open `http://localhost`.

The frontend's Nginx server forwards `/api/` requests to the backend. MySQL
data persists across container restarts; `docker compose down -v` also deletes
the database volume and all stored stories, chapters, and audio.
