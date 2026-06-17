/**
 * Create or update a staff user with a bcrypt-hashed password.
 * Usage:
 *   node scripts/create_user.js <email> <password> <role>
 *   node scripts/create_user.js manager@afeka.ac.il campus123 operations_manager
 * Roles: operations_manager | it_admin | cleaner
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { query, pool } from "../src/db.js";

const [email, password, role] = process.argv.slice(2);
if (!email || !password || !role) {
  console.error("usage: node scripts/create_user.js <email> <password> <role>");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
await query(
  `INSERT INTO users (email, pwd_hash, role) VALUES ($1,$2,$3)
   ON CONFLICT (email) DO UPDATE SET pwd_hash = EXCLUDED.pwd_hash, role = EXCLUDED.role`,
  [email, hash, role]
);
console.log(`user ${email} (${role}) created/updated`);
await pool.end();
