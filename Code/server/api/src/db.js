import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://campus:campus@localhost:5433/campus_sense",
});

export const query = (text, params) => pool.query(text, params);
