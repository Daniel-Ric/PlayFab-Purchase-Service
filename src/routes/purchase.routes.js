import express from "express";
import Joi from "joi";
import {jwtMiddleware} from "../utils/jwt.js";
import {asyncHandler} from "../utils/async.js";
import {badRequest} from "../utils/httpError.js";
import {getBalances, getInventory, quoteOffer, virtualPurchase} from "../services/purchase.service.js";
import {getCreators} from "../services/marketplace.service.js";
import {getMCToken} from "../services/mc.service.js";
import {env} from "../config/env.js";

const router = express.Router();

function pickMcAndExternal(req) {
    const mc = req.headers["x-mc-token"];
    const st = req.headers["x-playfab-session"];
    const pfid = req.headers["x-playfab-id"];
    const marketplaceToken = req.headers["x-marketplace-token"] || null;
    const xlinkToken = req.headers["x-xlink-token"] || null;
    return {mc, st, pfid, marketplaceToken, xlinkToken};
}

router.get("/marketplace/creators", jwtMiddleware, asyncHandler(async (req, res) => {
    const {mc, st} = pickMcAndExternal(req);
    let mcToken = mc || null;
    if (!mcToken && st) mcToken = await getMCToken(st);
    if (!mcToken) throw badRequest("x-mc-token oder x-playfab-session ist erforderlich");
    const creators = await getCreators(mcToken);
    res.json({count: Object.keys(creators).length, creators});
}));

router.post("/quote", jwtMiddleware, asyncHandler(async (req, res) => {
    const schema = Joi.object({offerId: Joi.string().required(), price: Joi.number().positive().optional()});
    const {value, error} = schema.validate(req.body || {});
    if (error) throw badRequest(error.message);
    const {mc, st, marketplaceToken, xlinkToken} = pickMcAndExternal(req);
    let mcToken = mc || null;
    if (!mcToken && st) mcToken = await getMCToken(st);
    if (!mcToken) throw badRequest("x-mc-token oder x-playfab-session ist erforderlich");
    const data = await quoteOffer({
        offerId: value.offerId,
        mcToken,
        marketplaceToken: env.ENABLE_MARKETPLACE_API ? marketplaceToken : null,
        xlinkToken: env.ENABLE_XLINK_API ? xlinkToken : null,
        price: value.price
    });
    res.json(data);
}));

router.post("/virtual", jwtMiddleware, asyncHandler(async (req, res) => {
    const schema = Joi.object({
        offerId: Joi.string().required(), price: Joi.number().positive().required(), xuid: Joi.string().optional()
    });
    const {value, error} = schema.validate(req.body || {});
    if (error) throw badRequest(error.message);
    const {mc, st} = pickMcAndExternal(req);
    let mcToken = mc || null;
    if (!mcToken && st) mcToken = await getMCToken(st);
    if (!mcToken) throw badRequest("x-mc-token oder x-playfab-session ist erforderlich");
    const tx = await virtualPurchase({offerId: value.offerId, price: value.price, mcToken, xuid: value.xuid});
    res.json(tx);
}));

router.get("/inventory/balances", jwtMiddleware, asyncHandler(async (req, res) => {
    const {mc, st} = pickMcAndExternal(req);
    let mcToken = mc || null;
    if (!mcToken && st) mcToken = await getMCToken(st);
    if (!mcToken) throw badRequest("x-mc-token oder x-playfab-session ist erforderlich");
    const data = await getBalances(mcToken);
    res.json(data);
}));

router.get("/inventory/entitlements", jwtMiddleware, asyncHandler(async (req, res) => {
    const includeReceipt = String(req.query.includeReceipt || "false") === "true";
    const {mc, st} = pickMcAndExternal(req);
    let mcToken = mc || null;
    if (!mcToken && st) mcToken = await getMCToken(st);
    if (!mcToken) throw badRequest("x-mc-token oder x-playfab-session ist erforderlich");
    const data = await getInventory(mcToken, includeReceipt);
    res.json(data);
}));

export default router;
