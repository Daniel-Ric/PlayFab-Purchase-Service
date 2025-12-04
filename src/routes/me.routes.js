import express from "express";
import Joi from "joi";
import {jwtMiddleware} from "../utils/jwt.js";
import {asyncHandler} from "../utils/async.js";
import {badRequest} from "../utils/httpError.js";
import {env} from "../config/env.js";
import {getBalances, getInventory, getMCToken} from "../services/mc.service.js";

const router = express.Router();

function pickMc(req) {
    const mc = req.headers["x-mc-token"];
    const st = req.headers["x-playfab-session"];
    return {mc, st};
}

router.get("/summary", jwtMiddleware, asyncHandler(async (req, res) => {
    const schema = Joi.object({
        includeBalances: Joi.boolean().truthy("true").falsy("false").default(true),
        includeInventory: Joi.boolean().truthy("true").falsy("false").default(true),
        includeReceipt: Joi.boolean().truthy("true").falsy("false").default(false),
        inventoryLimit: Joi.number().integer().min(0)
    });
    const {value, error} = schema.validate(req.query);
    if (error) throw badRequest(error.message);

    const {mc, st} = pickMc(req);
    let mcToken = mc || null;
    if (!mcToken && st) mcToken = await getMCToken(st);
    if (!mcToken) throw badRequest("x-mc-token or x-playfab-session is required");

    const user = {
        id: req.user?.sub || null,
        xuid: req.user?.xuid || null,
        editionType: req.user?.editionType || env.EDITION_TYPE,
        buildPlat: req.user?.buildPlat || env.BUILD_PLAT
    };

    const tasks = [];
    const keys = [];

    if (value.includeBalances) {
        tasks.push(getBalances(mcToken));
        keys.push("balances");
    }

    if (value.includeInventory) {
        tasks.push(getInventory(mcToken, value.includeReceipt));
        keys.push("inventory");
    }

    const settled = tasks.length ? await Promise.allSettled(tasks) : [];
    const summary = {user};

    settled.forEach((result, index) => {
        const key = keys[index];
        if (key === "balances") {
            summary.balances = result.status === "fulfilled" ? result.value : null;
        } else if (key === "inventory") {
            if (result.status === "fulfilled") {
                const entitlements = Array.isArray(result.value) ? result.value : [];
                const total = entitlements.length;
                let items = total > 1 ? entitlements.slice().reverse() : entitlements;
                if (typeof value.inventoryLimit === "number") {
                    items = items.slice(0, value.inventoryLimit);
                }
                summary.inventory = {count: total, entitlements: items};
            } else {
                summary.inventory = null;
            }
        }
    });

    res.json(summary);
}));

export default router;
