import express from "express";
import {jwtMiddleware} from "../utils/jwt.js";
import {asyncHandler} from "../utils/async.js";
import {badRequest} from "../utils/httpError.js";
import {getBalances, getInventory} from "../services/minecraft.service.js";

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

export default router;
