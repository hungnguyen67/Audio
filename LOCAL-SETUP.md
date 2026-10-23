# Local development

Run the application directly on Windows without Docker. You need Python,
Node.js/npm, and a local MySQL server. Database connection defaults are in
`backend/app/core/config.py`. Initialize a fresh database with
`backend/migrations/001_init.sql`; apply `backend/migrations/002_migration.sql`
only when upgrading an older database.

Create the Python environment and install backend requirements once from the
repository root:

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

Start both services from the repository root with one command:

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
