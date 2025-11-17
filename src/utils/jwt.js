import jwt from "jsonwebtoken";
import {env} from "../config/env.js";
import {forbidden, unauthorized} from "./httpError.js";

export function signJwt(payload, expiresIn = "1h") {
    return jwt.sign(payload, env.JWT_SECRET, {expiresIn});
}

export function verifyJwt(token) {
    try {
        return jwt.verify(token, env.JWT_SECRET);
    } catch {
        return null;
    }
}

export function jwtMiddleware(req, res, next) {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return next(unauthorized("Missing Authorization header"));

    const match = String(authHeader).match(/^Bearer\s+(.+)$/i);
    if (!match) return next(unauthorized("Invalid Authorization header format"));

    const token = match[1].trim();
    const decoded = verifyJwt(token);
    if (!decoded) return next(forbidden("Invalid or expired JWT"));
    req.user = decoded;
    next();
}
