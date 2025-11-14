import express from "express";
import Joi from "joi";
import {jwtMiddleware} from "../utils/jwt.js";
import {asyncHandler} from "../utils/async.js";
import {badRequest} from "../utils/httpError.js";
import {getBalances, getInventory, quoteOffer, virtualPurchase} from "../services/purchase.service.js";
import {getCreators} from "../services/marketplace.service.js";
import {getMCToken} from "../services/mc.service.js";
import {purchaseLimiter} from "../middleware/rateLimit.js";

const router = express.Router();

router.use(purchaseLimiter);
router.use(jwtMiddleware);

function pickMc(req) {
    const mc = req.headers["x-mc-token"];
    const st = req.headers["x-playfab-session"];
    return {mc, st};
}

router.get("/marketplace/creators", asyncHandler(async (req, res) => {
    const {mc, st} = pickMc(req);
    let mcToken = mc || null;
    if (!mcToken && st) mcToken = await getMCToken(st);
    if (!mcToken) throw badRequest("x-mc-token oder x-playfab-session ist erforderlich");
    const creators = await getCreators(mcToken);
    res.json({count: Object.keys(creators).length, creators});
}));

router.post("/quote", asyncHandler(async (req, res) => {
    const schema = Joi.object({
        offerId: Joi.string().required(), price: Joi.number().positive().required(), details: Joi.object().optional()
    });
    const {value, error} = schema.validate(req.body || {});
    if (error) throw badRequest(error.message);
    const {mc, st} = pickMc(req);
    let mcToken = mc || null;
    if (!mcToken && st) mcToken = await getMCToken(st);
    if (!mcToken) throw badRequest("x-mc-token oder x-playfab-session ist erforderlich");
    const data = await quoteOffer({
        offerId: value.offerId, mcToken, price: value.price, details: value.details
    });
    res.json(data);
}));

router.post("/virtual", asyncHandler(async (req, res) => {
    const schema = Joi.object({
        offerId: Joi.string().required(),
        price: Joi.number().positive().required(),
        xuid: Joi.string().optional(),
        correlationId: Joi.string().optional(),
        deviceSessionId: Joi.string().optional(),
        seq: Joi.number().integer().optional(),
        buildPlat: Joi.number().integer().optional(),
        clientIdPurchase: Joi.string().optional(),
        editionType: Joi.string().optional(),
        includePostState: Joi.boolean().truthy("true").falsy("false").default(true)
    });
    const {value, error} = schema.validate(req.body || {});
    if (error) throw badRequest(error.message);
    const {mc, st} = pickMc(req);
    let mcToken = mc || null;
    if (!mcToken && st) mcToken = await getMCToken(st);
    if (!mcToken) throw badRequest("x-mc-token oder x-playfab-session ist erforderlich");
    const tx = await virtualPurchase({
        offerId: value.offerId,
        price: value.price,
        mcToken,
        xuid: value.xuid,
        buildPlat: value.buildPlat,
        clientIdPurchase: value.clientIdPurchase,
        correlationId: value.correlationId,
        deviceSessionId: value.deviceSessionId,
        seq: value.seq,
        editionType: value.editionType
    });
    if (!value.includePostState) {
        return res.json(tx);
    }
    const [balances, inventory] = await Promise.allSettled([getBalances(mcToken), getInventory(mcToken, true)]);
    const balancesValue = balances.status === "fulfilled" ? balances.value : null;
    let inventoryValue = null;
    if (inventory.status === "fulfilled") {
        const entitlements = Array.isArray(inventory.value) ? inventory.value : [];
        inventoryValue = {count: entitlements.length, entitlements};
    }
    res.json({
        ...tx, balances: balancesValue, inventory: inventoryValue
    });
}));

router.get("/inventory/balances", asyncHandler(async (req, res) => {
    const {mc, st} = pickMc(req);
    let mcToken = mc || null;
    if (!mcToken && st) mcToken = await getMCToken(st);
    if (!mcToken) throw badRequest("x-mc-token oder x-playfab-session ist erforderlich");
    const data = await getBalances(mcToken);
    res.json(data);
}));

router.get("/inventory/entitlements", asyncHandler(async (req, res) => {
    const includeReceipt = String(req.query.includeReceipt || "false") === "true";
    const {mc, st} = pickMc(req);
    let mcToken = mc || null;
    if (!mcToken && st) mcToken = await getMCToken(st);
    if (!mcToken) throw badRequest("x-mc-token oder x-playfab-session ist erforderlich");
    const entitlements = await getInventory(mcToken, includeReceipt);
    res.json({count: entitlements.length, entitlements});
}));

export default router;
