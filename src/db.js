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

  // Index for leaderboard queries
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_users_pnl ON users (pnl DESC)`);

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

  // Enforce single default wallet per user (best-effort)
  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS wallets_one_default_insert
    AFTER INSERT ON wallets
    WHEN NEW.is_default = 1
    BEGIN
      UPDATE wallets SET is_default = 0 WHERE telegram_id = NEW.telegram_id AND id != NEW.id;
    END;
  `);

  // Schema is frozen for hackathon simplicity; no runtime ALTER/row migrations

  return db;
}
