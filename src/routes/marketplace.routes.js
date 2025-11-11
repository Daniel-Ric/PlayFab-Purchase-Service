import express from "express";
import Joi from "joi";
import {jwtMiddleware} from "../utils/jwt.js";
import {asyncHandler} from "../utils/async.js";
import {badRequest, internal} from "../utils/httpError.js";
import {env} from "../config/env.js";
import {getCreatorsFromStoreConfig, getCreatorSummary, getOfferDetails} from "../services/marketplace.service.js";

const router = express.Router();

router.get("/creators", jwtMiddleware, asyncHandler(async (req, res) => {
    const mcToken = req.headers["x-mc-token"];
    if (!mcToken) throw badRequest("Missing x-mc-token header");
    const creators = await getCreatorsFromStoreConfig(mcToken);
    res.json({creators});
}));

router.get("/creator/summary", jwtMiddleware, asyncHandler(async (req, res) => {
    const schema = Joi.object({creator: Joi.string().min(1).required()});
    const {value, error} = schema.validate(req.query);
    if (error) throw badRequest(error.message);
    if (!env.ENABLE_MARKETPLACE_API || !env.MARKETPLACE_API_BASE) {
        throw internal("Marketplace API disabled");
    }
    const marketplaceToken = req.headers["x-marketplace-token"] || null;
    const xlinkToken = req.headers["x-xlink-token"] || null;
    const data = await getCreatorSummary(value.creator, {marketplaceToken, xlinkToken});
    res.json(data);
}));

router.get("/offer/details", jwtMiddleware, asyncHandler(async (req, res) => {
    const schema = Joi.object({offerId: Joi.string().min(1).required()});
    const {value, error} = schema.validate(req.query);
    if (error) throw badRequest(error.message);
    if (!env.ENABLE_MARKETPLACE_API || !env.MARKETPLACE_API_BASE) {
        throw internal("Marketplace API disabled");
    }
    const marketplaceToken = req.headers["x-marketplace-token"] || null;
    const xlinkToken = req.headers["x-xlink-token"] || null;
    const data = await getOfferDetails(value.offerId, {marketplaceToken, xlinkToken});
    res.json(data);
}));

export default router;
