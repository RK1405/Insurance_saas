import pg from 'pg';
import { config } from './config.js';

// Return NUMERIC as JS numbers (amounts are rupees with 2 decimals, well within float precision)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// Return DATE as plain YYYY-MM-DD strings, avoiding timezone shifts
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export const query = (text, params) => pool.query(text, params);

export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

/** Atomically increments a per-organisation counter (used for quote / policy numbers). */
export async function nextCounter(db, orgId, name) {
  const { rows } = await db.query(
    `insert into counters (org_id, name, value) values ($1, $2, 1)
     on conflict (org_id, name) do update set value = counters.value + 1
     returning value`,
    [orgId, name],
  );
  return Number(rows[0].value);
}
