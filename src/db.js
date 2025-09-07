import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;

// Supabase requires SSL
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function initDB() {
  // Create tables if they don’t exist (safe to re-run)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      language_code TEXT,
      last_active TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      pnl REAL DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      address TEXT NOT NULL,
      private_key TEXT NOT NULL,
      is_default BOOLEAN DEFAULT FALSE,
      is_deleted BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_wallets_telegram ON wallets (telegram_id);`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS copy_trading (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      master_wallet_address TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      last_tx_version TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_copy_trading_telegram ON copy_trading (telegram_id);`
  );

  // Backfill columns in case table existed before
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;`);
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;`
  );
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;`
  );
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS language_code TEXT;`
  );
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP;`
  );
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();`
  );

  console.log("✅ Database ready");
}
