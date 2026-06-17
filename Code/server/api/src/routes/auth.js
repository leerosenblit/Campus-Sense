import { Router } from "express";
import bcrypt from "bcrypt";
import Joi from "joi";
import { query } from "../db.js";
import { signToken } from "../auth.js";

const router = Router();

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(1).required(),
});

// POST /auth/login — authenticate a staff user and issue a JWT (Table 4.1).
router.post("/login", async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const { rows } = await query("SELECT * FROM users WHERE email = $1", [value.email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(value.password, user.pwd_hash))) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  res.json({ token: signToken(user), role: user.role, email: user.email });
});

export default router;
