<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cloud Agent

Local Postgres 16 is installed on the machine. Do not use `docker compose` here: that file bind-mounts `/var/skywin-pitr`, which is not present.

- If `.env.local` is missing, copy `.env.example`. `DATABASE_URL` is `postgresql://skywin:skywin@localhost:5432/skywin_bill`.
- The boot script starts the cluster with `sudo pg_ctlcluster 16 main start` (systemd is not running), creates the `skywin` role and `skywin_bill` database, runs `CREATE EXTENSION IF NOT EXISTS pg_trgm` as the postgres user, then `npx drizzle-kit push --force`. `pg_trgm` must exist before the push or the gin trigram indexes fail.
- Dev server: `npm run dev` on port 3000. It is started by the environment when the port is free.
- Admin login: phone `9999999999`, password from `ADMIN_PASSWORD` in `.env.local` (the example value is `change-me`).
- `npm run db:seed` imports the Excel files in the repo root and truncates products, suppliers, and related sales tables. The cloud image may already contain that seed.
- Mac, Windows, and Android label clients are not part of this Linux environment.
