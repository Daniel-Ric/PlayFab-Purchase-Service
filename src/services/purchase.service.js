import crypto from "node:crypto";
import {env} from "../config/env.js";
import {createHttp} from "../utils/http.js";
import {badRequest, internal} from "../utils/httpError.js";
import {getOfferDetails} from "./marketplace.service.js";

const http = createHttp(env.HTTP_TIMEOUT_MS);

function pickPrice(details) {
    const dp = details?.DisplayProperties || details?.offer?.displayProperties || null;
    if (dp && typeof dp.price === "number") return dp.price;
    const nested = details?.offer?.price?.amount ?? details?.price?.amount ?? null;
    if (typeof nested === "number") return nested;
    return 0;
}

export async function quoteOffer({offerId, mcToken, marketplaceToken, xlinkToken, price}) {
    if (!offerId) throw badRequest("offerId is required");
    if (!mcToken) throw badRequest("mcToken is required");
    let finalPrice = 0;
    let details = null;
    if (env.ENABLE_MARKETPLACE_API && env.MARKETPLACE_API_BASE) {
        details = await getOfferDetails(offerId, {marketplaceToken, xlinkToken});
        finalPrice = pickPrice(details);
    } else {
        if (typeof price !== "number" || price <= 0) {
            throw badRequest("price required when Marketplace API is disabled");
        }
        finalPrice = price;
        details = {offerId};
    }
    return {offerId, price: finalPrice, details};
}

export async function virtualPurchase({
                                          offerId,
                                          price,
                                          mcToken,
                                          xuid,
                                          buildPlat = 1,
                                          clientIdPurchase = "xlink_purchase_addon"
                                      }) {
    if (!offerId) throw badRequest("offerId is required");
    if (typeof price !== "number" || price <= 0) throw badRequest("price must be > 0");
    if (!mcToken) throw badRequest("mcToken is required");
    const correlationId = crypto.randomBytes(16).toString("hex");
    const deviceSessionId = crypto.randomBytes(16).toString("hex");
    const seq = Math.floor(Math.random() * 10000);
    const editionType = "Android";
    const url = "https://entitlements.mktpl.minecraft-services.net/api/v1.0/transaction/virtual";
    const payload = {
        CustomTags: {
            BuildPlat: buildPlat,
            ClientId: clientIdPurchase,
            CorrelationId: correlationId,
            DeviceSessionId: deviceSessionId,
            Seq: seq,
            TitleId: env.PLAYFAB_TITLE_ID || "20ca2",
            Xuid: xuid || "Unknown",
            editionType
        }, OfferId: offerId, StoreId: "", VirtualCurrency: {Amount: String(price), Type: "Minecoin"}
    };
    try {
        const {data} = await http.post(url, payload, {
            headers: {
                authorization: mcToken,
                Accept: "application/json",
                "Content-Type": "application/json",
                Connection: "Keep-Alive",
                "Accept-Encoding": "gzip",
                "User-Agent": "libhttpclient/1.0.0.0",
                Host: "entitlements.mktpl.minecraft-services.net",
                inventoryetag: "1/MTE0MQ==",
                inventoryversion: "1/MTE0MQ=="
            }
        });
        return {correlationId, deviceSessionId, seq, transaction: data};
    } catch (err) {
        const code = err.response?.data?.code || "";
        if (code === "AlreadyOwned") throw internal("Already owned", {code});
        if (code === "InsufficientFunds") throw internal("Insufficient funds", err.response?.data);
        throw internal("Virtual transaction failed", err.response?.data || err.message);
    }
}

export async function getBalances(mcToken) {
    if (!mcToken) throw badRequest("mcToken is required");
    try {
        const {data} = await http.post("https://entitlements.mktpl.minecraft-services.net/api/v1.0/currencies/virtual/balances", {}, {
            headers: {
                authorization: mcToken,
                Accept: "application/json",
                "Content-Type": "application/json",
                Connection: "Keep-Alive",
                "Accept-Encoding": "gzip",
                "User-Agent": "libhttpclient/1.0.0.0",
                Host: "entitlements.mktpl.minecraft-services.net",
                inventoryetag: "1/MTE0MQ=="
            }
        });
        return data;
    } catch (err) {
        throw internal("Failed to fetch balances", err.response?.data || err.message);
    }
}

export async function getInventory(mcToken, includeReceipt = false) {
    if (!mcToken) throw badRequest("mcToken is required");
    const url = `https://entitlements.mktpl.minecraft-services.net/api/v1.0/player/inventory?includeReceipt=${includeReceipt ? "true" : "false"}`;
    try {
        const {data} = await http.get(url, {
            headers: {
                authorization: mcToken,
                Accept: "application/json",
                "Content-Type": "application/json",
                Connection: "Keep-Alive",
                "Accept-Encoding": "gzip",
                "User-Agent": "libhttpclient/1.0.0.0",
                Host: "entitlements.mktpl.minecraft-services.net"
            }
        });
        return data;
    } catch (err) {
        throw internal("Failed to fetch inventory", err.response?.data || err.message);
    }
}
