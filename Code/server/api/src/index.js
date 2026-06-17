import "dotenv/config";
import { createApp } from "./app.js";

const { httpServer } = createApp();
const PORT = process.env.API_PORT || 4000;
httpServer.listen(PORT, () => console.log(`Campus-Sense API on :${PORT}`));
