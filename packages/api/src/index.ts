import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { config } from "./config/index.js";
import passport from "./config/passport.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { familyRouter } from "./routes/families.js";
import { mealsRouter } from "./routes/meals.js";
import { weekPlanRouter } from "./routes/weekPlan.js";
import { groceryRouter } from "./routes/grocery.js";
import { displayRouter } from "./routes/display.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // Allow Google avatar images served via the user's `avatarUrl`.
        "img-src": ["'self'", "data:", "https://*.googleusercontent.com"],
        // The OAuth callback issues a 302 to the SPA; no embedded scripts are
        // returned from this API, but the API also serves the production SPA
        // bundle (which uses external JS/CSS files).
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "connect-src": ["'self'"],
        "form-action": ["'self'", "https://accounts.google.com"],
        "frame-ancestors": ["'none'"],
        "object-src": ["'none'"],
      },
    },
  }),
);
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  }),
);
app.use(morgan("combined"));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// Routes
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/families", familyRouter);
app.use("/api/families", mealsRouter);
app.use("/api/families", weekPlanRouter);
app.use("/api/families", groceryRouter);
app.use("/api/display", displayRouter);

// Static file serving for production
const webDistPath = path.resolve(__dirname, "../../web/dist");
const publicPath = path.resolve(__dirname, "../public");

if (existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get("{*splat}", (_req, res) => {
    res.sendFile(path.join(webDistPath, "index.html"));
  });
} else if (existsSync(publicPath)) {
  app.use(express.static(publicPath));
  app.get("{*splat}", (_req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
  });
}

// Start server
app.listen(config.port, () => {
  console.log(`API server running on port ${config.port}`);
});

export default app;
