import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const test = async () => {
  const res = await pool.query("SELECT NOW()");
  console.log("✅ Connected to DB:", res.rows[0]);
  process.exit();
};

test();
