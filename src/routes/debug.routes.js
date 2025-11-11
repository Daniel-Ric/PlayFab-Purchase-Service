import express from "express";
import Joi from "joi";
import {jwtMiddleware} from "../utils/jwt.js";
import {asyncHandler} from "../utils/async.js";
import {badRequest} from "../utils/httpError.js";
import jwt from "jsonwebtoken";

const router = express.Router();

function b64urlToString(s) {
    let t = String(s || "");
    t = t.replace(/-/g, "+").replace(/_/g, "/");
    const pad = t.length % 4;
    if (pad) t += "=".repeat(4 - pad);
    return Buffer.from(t, "base64").toString("utf8");
}

function tryParseJson(s) {
    try {
        return JSON.parse(s)
    } catch {
        return null
    }
}

function normalizeToken(tok) {
    let t = String(tok || "").trim();
    let prefix = null;
    let uhs = null;
    if (/^Bearer\s+/i.test(t)) {
        prefix = "Bearer";
        t = t.replace(/^Bearer\s+/i, "").trim();
    }
    if (/^XBL3\.0\s/i.test(t)) {
        prefix = "XBL3.0";
        const m = t.match(/^XBL3\.0\s+x=([^;]+);(.+)$/i);
        if (m) {
            uhs = m[1];
            t = m[2].trim();
        } else {
            t = t.replace(/^XBL3\.0\s+/i, "").trim();
        }
    }
    if (/^MCToken\s+/i.test(t)) {
        prefix = "MCToken";
        t = t.replace(/^MCToken\s+/i, "").trim();
    }
    return {raw: t, prefix, uhs};
}

function decodeCompact(raw) {
    const p = String(raw || "").split(".");
    if (p.length === 3) {
        const h = tryParseJson(b64urlToString(p[0]));
        const pl = tryParseJson(b64urlToString(p[1]));
        if (h && pl) return {kind: "JWS", header: h, payload: pl};
    }
    if (p.length === 5) {
        const h = tryParseJson(b64urlToString(p[0]));
        if (h) return {kind: "JWE", header: h, payload: null};
    }
    return null;
}

function decodeOne(input) {
    const {raw, prefix, uhs} = normalizeToken(input);
    const cp = decodeCompact(raw);
    let header = null;
    let payload = null;
    let ok = false;
    let kind = null;
    if (cp && cp.kind === "JWS") {
        header = cp.header;
        payload = cp.payload;
        ok = true;
        kind = "JWS";
    } else if (cp && cp.kind === "JWE") {
        header = cp.header;
        payload = null;
        ok = true;
        kind = "JWE";
    } else {
        const dec = jwt.decode(raw, {complete: true});
        if (dec) {
            header = dec.header || null;
            payload = dec.payload || null;
            ok = true;
            kind = "JWS";
        }
    }
    let hasExp = false;
    let secondsRemaining = null;
    const now = Math.floor(Date.now() / 1000);
    if (payload && typeof payload.exp === "number") {
        hasExp = true;
        secondsRemaining = payload.exp - now;
    }
    if (!ok && /^[A-Za-z0-9+/=.-]+$/.test(raw) && raw.length > 40 && raw.includes("-")) {
        header = {typ: "PlayFabSessionTicket"};
        payload = {length: raw.length};
        ok = true;
        kind = "OPAQUE";
    }
    return {ok, header, payload, meta: {prefix, uhs, hasExp, secondsRemaining, rawLength: raw?.length || 0, kind}};
}

router.post("/decode-token", jwtMiddleware, asyncHandler(async (req, res) => {
    const schema = Joi.object({token: Joi.string(), tokens: Joi.object().pattern(/.*/, Joi.string())});
    const {value, error} = schema.validate(req.body || {});
    if (error) throw badRequest(error.message);
    if (value.tokens && typeof value.tokens === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value.tokens)) out[k] = decodeOne(v);
        return res.json({ok: true, decoded: out});
    }
    if (!value.token) throw badRequest("token or tokens required");
    const r = decodeOne(value.token);
    res.json(r);
}));

export default router;
