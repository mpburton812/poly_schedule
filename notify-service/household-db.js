let pool = null;
let enabled = false;

export function isDatabaseEnabled() {
  return enabled;
}

async function getPool() {
  if (!enabled || !pool) return null;
  return pool;
}

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS households (
      id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL DEFAULT 0,
      config JSONB NOT NULL,
      events JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_actor_partner_id TEXT
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS username_registry (
      username TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      partner_id TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function initHouseholdDatabase() {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) return false;

  const { default: pg } = await import('pg');
  pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await ensureSchema(client);
    enabled = true;
    console.log('[notify] Postgres household database enabled');
    return true;
  } finally {
    client.release();
  }
}

export async function readHouseholdFromDatabase(householdId) {
  const db = await getPool();
  if (!db || !householdId) return null;
  const result = await db.query(
    `SELECT revision, config, events, updated_at, last_actor_partner_id
     FROM households WHERE id = $1`,
    [householdId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    revision: row.revision,
    config: row.config,
    events: row.events,
    updatedAt: row.updated_at?.toISOString?.() || new Date().toISOString(),
    lastActorPartnerId: row.last_actor_partner_id || null
  };
}

export async function writeHouseholdToDatabase(householdId, household) {
  const db = await getPool();
  if (!db || !householdId || !household) return null;
  await db.query(
    `INSERT INTO households (id, revision, config, events, updated_at, last_actor_partner_id)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       revision = EXCLUDED.revision,
       config = EXCLUDED.config,
       events = EXCLUDED.events,
       updated_at = EXCLUDED.updated_at,
       last_actor_partner_id = EXCLUDED.last_actor_partner_id`,
    [
      householdId,
      household.revision ?? 0,
      JSON.stringify(household.config ?? {}),
      household.events == null ? null : JSON.stringify(household.events),
      household.updatedAt || new Date().toISOString(),
      household.lastActorPartnerId || null
    ]
  );
  return household;
}

export async function readUsernameRegistryFromDatabase() {
  const db = await getPool();
  if (!db) return {};
  const result = await db.query(
    `SELECT username, household_id, partner_id, updated_at FROM username_registry`
  );
  const usernames = {};
  for (const row of result.rows) {
    usernames[row.username] = {
      householdId: row.household_id,
      partnerId: row.partner_id,
      updatedAt: row.updated_at?.toISOString?.() || null
    };
  }
  return usernames;
}

export async function writeUsernameRegistryToDatabase(usernames) {
  const db = await getPool();
  if (!db) return;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM username_registry');
    for (const [username, entry] of Object.entries(usernames || {})) {
      await client.query(
        `INSERT INTO username_registry (username, household_id, partner_id, updated_at)
         VALUES ($1, $2, $3, $4)`,
        [username, entry.householdId, entry.partnerId, entry.updatedAt || new Date().toISOString()]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
