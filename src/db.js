import sqlite3 from "sqlite3";
import { open } from "sqlite";

// Open DB connection
export async function initDB() {
  const db = await open({
    filename: "./echovault.db",
    driver: sqlite3.Database,
  });

  // Create users table if not exists
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE,
      wallet_address TEXT,
      private_key TEXT,
      balance REAL DEFAULT 0,
      pnl REAL DEFAULT 0
    )
  `);

  // Optional index to speed up leaderboard queries
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_users_pnl ON users (pnl DESC)`);

  // Safe migration: add private_key column if it doesn't exist
  try {
    const pragma = await db.all("PRAGMA table_info(users)");
    const hasPrivateKey = pragma.some((col) => col.name === "private_key");
    if (!hasPrivateKey) {
      await db.exec("ALTER TABLE users ADD COLUMN private_key TEXT");
    }
  } catch (e) {
    // Log and continue; not fatal for startup
    console.warn("Warning: failed to ensure private_key column:", e);
  }

  // Multi-wallet support table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      address TEXT NOT NULL,
      private_key TEXT,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_wallets_telegram ON wallets (telegram_id)`
  );

  // One-time migration: move single wallet from users to wallets if present and no wallet rows exist for that user
  await db.exec(`
    INSERT INTO wallets (telegram_id, address, private_key, is_default)
    SELECT u.telegram_id, u.wallet_address, u.private_key, 1
    FROM users u
    WHERE u.wallet_address IS NOT NULL AND u.wallet_address <> ''
      AND NOT EXISTS (
        SELECT 1 FROM wallets w WHERE w.telegram_id = u.telegram_id
      )
  `);

  return db;
}
