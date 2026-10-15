import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// An agent's run has its own block of ports (AK-125): the dev server takes the first one.
const port = Number(process.env.AUTOKOLAB_PORT) || 5175;

export default defineConfig({ plugins: [react()], server: { port, strictPort: true }, preview: { port } });
