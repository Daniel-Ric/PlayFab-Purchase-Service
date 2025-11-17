import rateLimit from "express-rate-limit";
import {env} from "../config/env.js";

export const purchaseLimiter = rateLimit({
    windowMs: env.PURCHASE_RATE_LIMIT_WINDOW_MS,
    max: env.PURCHASE_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {error: {code: "TOO_MANY_REQUESTS", message: "Too many purchase requests"}}
});
