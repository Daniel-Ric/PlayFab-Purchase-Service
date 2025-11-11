import rateLimit from "express-rate-limit";

export const purchaseLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {error: {code: "TOO_MANY_REQUESTS", message: "Too many purchase requests"}}
});
