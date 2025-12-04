import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import chalk from "chalk";
import {env} from "./config/env.js";
import {swaggerSpec} from "./utils/swagger.js";
import healthRoutes from "./routes/health.routes.js";
import marketplaceRoutes from "./routes/marketplace.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import purchaseRoutes from "./routes/purchase.routes.js";
import debugRoutes from "./routes/debug.routes.js";
import {errorHandler, notFoundHandler} from "./middleware/error.js";
import {forbidden} from "./utils/httpError.js";
import {runWithRequestContext} from "./utils/context.js";

const app = express();
app.set("trust proxy", env.TRUST_PROXY);
app.disable("x-powered-by");

const mute = new Set(["/healthz", "/readyz", "/api-docs", "/openapi.json"]);

function ts() {
    return chalk.gray(new Date().toISOString().split("T")[1].split(".")[0]);
}

function bm(status) {
    if (status >= 500) return chalk.bgRed.black(" ERR ");
    if (status >= 400) return chalk.bgYellow.black(" WARN ");
    return chalk.bgGreen.black(" OK ");
}

function cm(m) {
    return {
        GET: chalk.cyan.bold("GET"),
        POST: chalk.green.bold("POST"),
        PUT: chalk.magenta.bold("PUT"),
        PATCH: chalk.yellow.bold("PATCH"),
        DELETE: chalk.red.bold("DELETE")
    }[m] || chalk.white.bold(m);
}

function cs(code) {
    if (code >= 500) return chalk.red(code);
    if (code >= 400) return chalk.yellow(code);
    if (code >= 300) return chalk.blue(code);
    return chalk.green(code);
}

function ct(ms) {
    if (ms < 200) return chalk.green(`${ms}ms`);
    if (ms < 1000) return chalk.yellow(`${ms}ms`);
    return chalk.red(`${ms}ms`);
}

app.use((req, res, next) => {
    const id = req.headers["x-correlation-id"] || req.headers["x-request-id"] || crypto.randomUUID();
    req.id = id;
    res.setHeader("X-Request-Id", id);
    const start = process.hrtime.bigint();
    runWithRequestContext({requestId: id}, () => {
        res.on("finish", () => {
            const url = req.url || "/";
            if (mute.has(url) || url.startsWith("/api-docs")) return;
            const ms = Number((process.hrtime.bigint() - start) / 1000000n);
            if (env.LOG_PRETTY) {
                console.log([ts(), bm(res.statusCode), cm(req.method || "GET"), chalk.white(url), cs(res.statusCode), ct(ms), chalk.dim(`#${id.slice(0, 6)}`)].join(" "));
            } else {
                console.log(`${new Date().toISOString()} ${req.method} ${url} ${res.statusCode} ${ms}ms ${id}`);
            }
        });
        next();
    });
});

const allowlist = (env.CORS_ORIGIN || "*").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowlist.includes("*") || allowlist.includes(origin)) return cb(null, true);
        cb(forbidden("CORS origin not allowed"));
    }, credentials: true
}));

app.use(helmet({contentSecurityPolicy: false, crossOriginResourcePolicy: {policy: "cross-origin"}}));
app.use(express.json({limit: "1mb"}));
app.use(compression());

const globalLimiter = rateLimit({
    windowMs: env.GLOBAL_RATE_LIMIT_WINDOW_MS,
    max: env.GLOBAL_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip: req => mute.has(req.path) || req.path.startsWith("/api-docs")
});

app.use(globalLimiter);

if (env.SWAGGER_ENABLED) {
    app.get("/openapi.json", (req, res) => res.json(swaggerSpec));
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        explorer: true, swaggerOptions: {tagsSorter: "none", operationsSorter: "alpha"}
    }));
}

app.use("/", healthRoutes);
app.use("/marketplace", marketplaceRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/purchase", purchaseRoutes);
app.use("/debug", debugRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
