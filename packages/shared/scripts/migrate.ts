// Migration runner. Applies SQL files under ./migrations in order using
// drizzle-orm's migrator, which tracks state in a __drizzle_migrations table.
//
// Usage:
//   DATABASE_URL=... bun run scripts/migrate.ts
//
// Run from the packages/shared dir. Env can come from a parent .env.local
// (we don't load it here — the caller is expected to source it).

import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(url, { ssl: 'require', max: 1 });
const db = drizzle(sql);

try {
  console.log('Running migrations…');
  await migrate(db, { migrationsFolder: './migrations' });
  console.log('Migrations applied.');
} catch (err) {
  console.error('Migration failed:', err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
