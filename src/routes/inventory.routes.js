import express from "express";
import {jwtMiddleware} from "../utils/jwt.js";
import {asyncHandler} from "../utils/async.js";
import {badRequest} from "../utils/httpError.js";
import {getBalances, getInventory} from "../services/minecraft.service.js";
import {getEntityTokenForPlayer, getInventoryItems} from "../services/playfab.service.js";
import {summarizeCreators} from "../utils/inventoryCreators.js";

const router = express.Router();

router.get("/balances", jwtMiddleware, asyncHandler(async (req, res) => {
    const mcToken = req.headers["x-mc-token"];
    if (!mcToken) throw badRequest("Missing x-mc-token header");
    const data = await getBalances(mcToken);
    res.json(data);
}));

router.get("/entitlements", jwtMiddleware, asyncHandler(async (req, res) => {
    const mcToken = req.headers["x-mc-token"];
    if (!mcToken) throw badRequest("Missing x-mc-token header");
    const includeReceipt = String(req.query.includeReceipt || "false") === "true";
    const data = await getInventory(mcToken, includeReceipt);
    res.json({count: data.length, entitlements: data});
}));

router.get("/creators", jwtMiddleware, asyncHandler(async (req, res) => {
    const mcToken = req.headers["x-mc-token"];
    if (!mcToken) throw badRequest("Missing x-mc-token header");
    const includeReceipt = String(req.query.includeReceipt || "false") === "true";
    const includeUnknown = String(req.query.includeUnknown || "false") === "true";
    const entitlements = await getInventory(mcToken, includeReceipt);
    const {totalItems, unknownCount, creators} = summarizeCreators(entitlements, {includeUnknown});
    res.json({count: Object.keys(creators).length, totalItems, unknownCount, creators});
}));

router.get("/playfab/items", jwtMiddleware, asyncHandler(async (req, res) => {
    const sessionTicket = req.headers["x-playfab-session"];
    const playfabId = req.headers["x-playfab-id"];
    if (!sessionTicket || !playfabId) throw badRequest("x-playfab-session and x-playfab-id are required");
    const filter = String(req.query.filter || "").trim();
    const type = req.query.type ? String(req.query.type).trim() : "";
    const id = req.query.id ? String(req.query.id).trim() : "";
    const stackId = req.query.stackId ? String(req.query.stackId).trim() : "";
    if (filter && (type || id || stackId)) throw badRequest("Use filter or type/id/stackId, not both");
    if (!filter && !type && !id && !stackId) throw badRequest("Provide filter or type/id/stackId");
    const countRaw = req.query.count;
    const count = countRaw === undefined ? null : Number(countRaw);
    if (count !== null && (!Number.isInteger(count) || count < 1 || count > 200)) {
        throw badRequest("count must be an integer between 1 and 200");
    }
    const continuationToken = req.query.continuationToken ? String(req.query.continuationToken) : null;
    const entityToken = await getEntityTokenForPlayer(sessionTicket, playfabId);
    const resolvedFilter = filter || buildInventoryFilter({type, id, stackId});
    const data = await getInventoryItems(entityToken, {filter: resolvedFilter, count, continuationToken});
    res.json(data);
}));

function buildInventoryFilter({type, id, stackId}) {
    const parts = [];
    if (type) parts.push(`type eq '${escapeFilterValue(type)}'`);
    if (id) parts.push(`id eq '${escapeFilterValue(id)}'`);
    if (stackId) parts.push(`stackId eq '${escapeFilterValue(stackId)}'`);
    return parts.join(" and ");
}

function escapeFilterValue(value) {
    return value.replaceAll("'", "''");
}

export default router;
