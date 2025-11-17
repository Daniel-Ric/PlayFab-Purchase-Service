import {badRequest, HttpError} from "../utils/httpError.js";
import {env} from "../config/env.js";

export function notFoundHandler(req, res, next) {
    next(new HttpError(404, `Route ${req.method} ${req.originalUrl} not found`, undefined, "HTTP_404"));
}

export function errorHandler(err, req, res, next) {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        err = badRequest("Invalid JSON body");
    }

    const status = err instanceof HttpError ? err.status : 500;
    const code = err.code || (err instanceof HttpError ? `HTTP_${status}` : "INTERNAL");

    const logPayload = {
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        status,
        code,
        message: err.message,
        details: err.details,
        stack: err.stack
    };

    try {
        console.error(JSON.stringify(logPayload));
    } catch {
        console.error(logPayload);
    }

    const body = {
        error: {
            code, message: err.message || "Internal Server Error"
        }
    };

    if (env.NODE_ENV !== "production") {
        if (err.details) body.error.details = err.details;
        if (err.stack) body.error.stack = err.stack;
    }

    res.status(status).json(body);
}
