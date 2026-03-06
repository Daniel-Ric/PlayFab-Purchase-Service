import rateLimit from "express-rate-limit";
import {env} from "../config/env.js";
import {tooManyRequests} from "../utils/httpError.js";

export const purchaseLimiter = rateLimit({
    windowMs: env.PURCHASE_RATE_LIMIT_WINDOW_MS,
    max: env.PURCHASE_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next) => next(tooManyRequests("Too many purchase requests"))
});
