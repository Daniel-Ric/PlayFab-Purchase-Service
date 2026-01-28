import express from "express";
import Joi from "joi";
import {jwtMiddleware} from "../utils/jwt.js";
import {asyncHandler} from "../utils/async.js";
import {badRequest} from "../utils/httpError.js";
import {
    bulkVirtualPurchase,
    getBalances,
    getInventory,
    quoteOffer,
    virtualPurchase
} from "../services/purchase.service.js";
import {getCreators} from "../services/marketplace.service.js";
import {getMCToken} from "../services/mc.service.js";
import {purchaseLimiter} from "../middleware/rateLimit.js";
import {submitItemRating} from "../services/review.service.js";
import {summarizeCreators} from "../utils/inventoryCreators.js";

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
    if (!mcToken) throw badRequest("x-mc-token or x-playfab-session is required");
    const creators = await getCreators(mcToken);
    res.json({count: Object.keys(creators).length, creators});
}));

router.post("/quote", asyncHandler(async (req, res) => {
    const schema = Joi.object({
        offerId: Joi.string().required(), price: Joi.number().min(0).required(), details: Joi.object().optional()
    });
    const {value, error} = schema.validate(req.body || {});
    if (error) throw badRequest(error.message);
    const {mc, st} = pickMc(req);
    let mcToken = mc || null;
    if (!mcToken && st) mcToken = await getMCToken(st);
    if (!mcToken) throw badRequest("x-mc-token or x-playfab-session is required");
    const data = await quoteOffer({
        offerId: value.offerId, mcToken, price: value.price, details: value.details
    });
    res.json(data);
}));

router.post("/virtual", asyncHandler(async (req, res) => {
    const schema = Joi.object({
        offerId: Joi.string().required(),
        price: Joi.number().min(0).required(),
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
    if (!mcToken) throw badRequest("x-mc-token or x-playfab-session is required");
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

router.post("/virtual/bulk", asyncHandler(async (req, res) => {
    const schema = Joi.object({
        items: Joi.array().items(Joi.object({
            offerId: Joi.string().required(),
            price: Joi.number().min(0).required(),
            xuid: Joi.string().optional(),
            correlationId: Joi.string().optional(),
            deviceSessionId: Joi.string().optional(),
            seq: Joi.number().integer().optional(),
            buildPlat: Joi.number().integer().optional(),
            clientIdPurchase: Joi.string().optional(),
            editionType: Joi.string().optional()
        })).min(1).required(),
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
    if (!mcToken) throw badRequest("x-mc-token or x-playfab-session is required");

    const sharedOptions = {
        xuid: value.xuid,
        buildPlat: value.buildPlat,
        clientIdPurchase: value.clientIdPurchase,
        correlationId: value.correlationId,
        deviceSessionId: value.deviceSessionId,
        seq: value.seq,
        editionType: value.editionType
    };

    const results = await bulkVirtualPurchase({
        items: value.items, mcToken, sharedOptions
    });

    let balancesValue = null;
    let inventoryValue = null;

    if (value.includePostState) {
        const hasSuccess = results.some(r => r && r.ok);
        if (hasSuccess) {
            const [balances, inventory] = await Promise.allSettled([getBalances(mcToken), getInventory(mcToken, true)]);
            balancesValue = balances.status === "fulfilled" ? balances.value : null;
            if (inventory.status === "fulfilled") {
                const entitlements = Array.isArray(inventory.value) ? inventory.value : [];
                inventoryValue = {count: entitlements.length, entitlements};
            }
        }
    }

    const successCount = results.filter(r => r && r.ok).length;
    const failureCount = results.length - successCount;

    res.json({
        count: results.length, successCount, failureCount, results, balances: balancesValue, inventory: inventoryValue
    });
}));

router.post("/rating", asyncHandler(async (req, res) => {
    const schema = Joi.object({
        itemId: Joi.string().min(1).required(),
        rating: Joi.number().integer().min(1).max(5).required(),
        isInstalled: Joi.boolean().truthy("true").falsy("false").default(false)
    });

    const {value, error} = schema.validate(req.body || {});
    if (error) throw badRequest(error.message);

    const entityToken = req.headers["x-entitytoken"] || req.headers["x-entity-token"] || null;
    let mcToken = null;
    let sessionTicket = null;
    let playfabId = null;
    let enforceOwnership = true;

    if (entityToken) enforceOwnership = false;

    const skipOwnership = String(req.headers["x-skip-ownership"] || "").toLowerCase();
    if (skipOwnership === "true" || skipOwnership === "1") enforceOwnership = false;

    if (!entityToken) {
        const {st} = pickMc(req);
        if (!st) throw badRequest("x-entitytoken or x-playfab-session is required");
        sessionTicket = String(st).trim();
        playfabId = req.headers["x-playfab-id"] || null;
        if (!playfabId) throw badRequest("x-playfab-id is required");
        if (enforceOwnership) {
            mcToken = await getMCToken(sessionTicket);
            if (!mcToken) throw badRequest("x-playfab-session is required");
        }
    }

    const out = await submitItemRating({
        mcToken,
        entityToken: entityToken ? String(entityToken).trim() : null,
        sessionTicket,
        playfabId: playfabId ? String(playfabId).trim() : null,
        itemId: value.itemId,
        rating: value.rating,
        isInstalled: value.isInstalled,
        enforceOwnership
    });

    res.json(out);
}));

router.get("/inventory/balances", asyncHandler(async (req, res) => {
    const {mc, st} = pickMc(req);
    let mcToken = mc || null;
    if (!mcToken && st) mcToken = await getMCToken(st);
    if (!mcToken) throw badRequest("x-mc-token or x-playfab-session is required");
    const data = await getBalances(mcToken);
    res.json(data);
}));

router.get("/inventory/entitlements", asyncHandler(async (req, res) => {
    const includeReceipt = String(req.query.includeReceipt || "false") === "true";
    const {mc, st} = pickMc(req);
    let mcToken = mc || null;
    if (!mcToken && st) mcToken = await getMCToken(st);
    if (!mcToken) throw badRequest("x-mc-token or x-playfab-session is required");
    const entitlements = await getInventory(mcToken, includeReceipt);
    res.json({count: entitlements.length, entitlements});
}));

router.get("/inventory/creators", asyncHandler(async (req, res) => {
    const includeReceipt = String(req.query.includeReceipt || "false") === "true";
    const includeUnknown = String(req.query.includeUnknown || "false") === "true";
    const {mc, st} = pickMc(req);
    let mcToken = mc || null;
    if (!mcToken && st) mcToken = await getMCToken(st);
    if (!mcToken) throw badRequest("x-mc-token or x-playfab-session is required");
    const entitlements = await getInventory(mcToken, includeReceipt);
    const creatorMap = await getCreators(mcToken);
    const creatorLookup = Object.fromEntries(Object.entries(creatorMap).map(([name, id]) => [String(id), name]));
    const {totalItems, unknownCount, creators} = summarizeCreators(entitlements, {includeUnknown, creatorLookup});
    res.json({count: Object.keys(creators).length, totalItems, unknownCount, creators});
}));

export default router;
