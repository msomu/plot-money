// Database client helpers.
//
// withRls runs a callback inside a transaction where the role is switched to
// `plot_app` and `app.current_user_id` is set. RLS policies on tenant tables
// then apply for everything inside. The transaction rolls back on throw,
// commits on success.
//
// withOwner runs a callback as the connection's owning role with no GUC set
// — used by Better Auth which manages its own access, and by admin scripts.

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql as rawSql } from 'drizzle-orm';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema/index.ts';

export type AppDatabase = PostgresJsDatabase<typeof schema>;

let _sql: Sql | undefined;
let _db: AppDatabase | undefined;

export function initDb(databaseUrl: string): AppDatabase {
  if (_db) return _db;
  _sql = postgres(databaseUrl, { ssl: 'require', max: 10 });
  _db = drizzle(_sql, { schema });
  return _db;
}

export function getDb(): AppDatabase {
  if (!_db) throw new Error('initDb(databaseUrl) must be called before getDb()');
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = undefined;
    _db = undefined;
  }
}

/**
 * Run `fn` inside a transaction with role=plot_app and app.current_user_id
 * pinned to `userId`. RLS applies to everything inside.
 */
export async function withRls<T>(userId: string, fn: (tx: AppDatabase) => Promise<T>): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(rawSql`SET LOCAL ROLE plot_app`);
    await tx.execute(rawSql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    return fn(tx as unknown as AppDatabase);
  });
}

/**
 * Run `fn` as the connection's owning role, no GUC set. Use only for
 * Better Auth, migrations, and admin tooling — never for tenant queries.
 */
export async function withOwner<T>(fn: (tx: AppDatabase) => Promise<T>): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => fn(tx as unknown as AppDatabase));
}
