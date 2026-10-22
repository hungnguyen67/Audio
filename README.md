# Audio Story Reader

## Development

- Install frontend dependencies with `npm ci` in `frontend/`.
- Create the project Python environment and install `backend/requirements.txt`.
- Initialize MySQL with `backend/migrations/001_init.sql`, then apply
  `backend/migrations/002_migration.sql`.
- Run `scripts/start.ps1` to start the backend and Vite development server.

The frontend development server is available at `http://127.0.0.1:3000`.
The backend listens at `http://127.0.0.1:3001`.

To create a production frontend build, run `npm run build` in `frontend/`.
The generated files are written to `frontend/dist/`.

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
