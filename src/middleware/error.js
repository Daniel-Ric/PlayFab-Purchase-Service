import {badRequest, HttpError} from "../utils/httpError.js";
import {env} from "../config/env.js";

const sensitiveKeyPattern = /(authorization|cookie|token|session|secret|password|api[-_]?key|jwt)/i;

function sanitizeString(value) {
    let out = String(value || "");
    out = out.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]");
    out = out.replace(/XBL3\.0\s+x=[^;]+;[^\s]+/gi, "XBL3.0 x=[REDACTED];[REDACTED]");
    out = out.replace(/(sessionticket|entitytoken|token|password|secret|api[_-]?key)=([^&\s]+)/gi, "$1=[REDACTED]");
    return out;
}

function sanitizeValue(value, depth = 0) {
    if (value === null || value === undefined) return value;
    if (depth > 6) return "[TRUNCATED]";

    const t = typeof value;
    if (t === "string") return sanitizeString(value);
    if (t === "number" || t === "boolean") return value;
    if (Array.isArray(value)) return value.map(v => sanitizeValue(v, depth + 1));
    if (t !== "object") return sanitizeString(value);

    const out = {};
    for (const [key, v] of Object.entries(value)) {
        if (sensitiveKeyPattern.test(key)) {
            out[key] = "[REDACTED]";
        } else {
            out[key] = sanitizeValue(v, depth + 1);
        }
    }
    return out;
}

export function notFoundHandler(req, res, next) {
    next(new HttpError(404, `Route ${req.method} ${req.originalUrl} not found`, undefined, "HTTP_404"));
}

export function errorHandler(err, req, res, next) {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        err = badRequest("Invalid JSON body");
    }

    const status = err instanceof HttpError ? err.status : 500;
    const code = err instanceof HttpError ? (err.code || `HTTP_${status}`) : "INTERNAL";
    const safeMessage = status >= 500 ? "Internal Server Error" : sanitizeString(err.message || "Error");
    const safeDetails = sanitizeValue(err.details);
    const safeStack = err.stack ? sanitizeString(err.stack) : undefined;

    const logPayload = {
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        status,
        code,
        message: sanitizeString(err.message || safeMessage),
        details: safeDetails,
        stack: safeStack
    };

    try {
        console.error(JSON.stringify(logPayload));
    } catch {
        console.error(logPayload);
    }

    const body = {
        error: {
            code,
            message: safeMessage
        }
    };

    if (env.NODE_ENV !== "production") {
        if (safeDetails !== undefined) body.error.details = safeDetails;
        if (safeStack) body.error.stack = safeStack;
    }

    res.status(status).json(body);
}
