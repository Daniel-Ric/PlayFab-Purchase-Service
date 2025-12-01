import crypto from "node:crypto";
import {env} from "../config/env.js";
import {createHttp} from "../utils/http.js";
import {badRequest, conflict, HttpError, internal} from "../utils/httpError.js";
import {getBalances as getMinecraftBalances, getInventory as getMinecraftInventory} from "./minecraft.service.js";

const http = createHttp(env.HTTP_TIMEOUT_MS);
const BULK_VIRTUAL_PURCHASE_CONCURRENCY = 4;

function createFailedBulkResult(err, item, index) {
    let status = 500;
    let code = "INTERNAL";
    let message = "Virtual transaction failed";
    let details;

    if (err instanceof HttpError) {
        status = err.status || status;
        code = err.code || code;
        message = err.message || message;
        if (err.details) details = err.details;
    } else if (err && typeof err === "object") {
        message = err.message || message;
        details = err;
    } else if (err) {
        message = String(err);
    }

    return {
        index, offerId: item?.offerId, price: item?.price, ok: false, error: {
            status, code, message, details
        }
    };
}

async function mapWithConcurrency(items, concurrency, fn) {
    const total = items.length;
    if (total === 0) return [];

    const results = new Array(total);
    const limit = Math.max(1, Math.min(concurrency, total));
    let index = 0;

    async function worker() {
        while (true) {
            const current = index++;
            if (current >= total) return;
            const item = items[current];
            try {
                results[current] = await fn(item, current);
            } catch (err) {
                results[current] = createFailedBulkResult(err, item, current);
            }
        }
    }

    const workers = [];
    for (let i = 0; i < limit; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);
    return results;
}

export async function quoteOffer({offerId, mcToken, price, details}) {
    if (!offerId) throw badRequest("offerId is required");
    if (!mcToken) throw badRequest("mcToken is required");
    if (typeof price !== "number" || price <= 0) throw badRequest("price must be > 0");
    const finalDetails = details && typeof details === "object" ? details : {offerId};
    return {offerId, price, details: finalDetails};
}

export async function virtualPurchase({
                                          offerId,
                                          price,
                                          mcToken,
                                          xuid,
                                          buildPlat = env.BUILD_PLAT,
                                          clientIdPurchase = env.CLIENT_ID_PURCHASE,
                                          correlationId,
                                          deviceSessionId,
                                          seq,
                                          editionType = env.EDITION_TYPE
                                      }) {
    if (!offerId) throw badRequest("offerId is required");
    if (typeof price !== "number" || price <= 0) throw badRequest("price must be > 0");
    if (!mcToken) throw badRequest("mcToken is required");
    const _correlationId = correlationId || crypto.randomBytes(16).toString("hex");
    const _deviceSessionId = deviceSessionId || crypto.randomBytes(16).toString("hex");
    const _seq = typeof seq === "number" ? seq : Math.floor(Math.random() * 10000);
    const _xuid = xuid || "Unknown";
    const url = "https://entitlements.mktpl.minecraft-services.net/api/v1.0/transaction/virtual";
    const payload = {
        CustomTags: {
            BuildPlat: buildPlat,
            ClientId: clientIdPurchase,
            CorrelationId: _correlationId,
            DeviceSessionId: _deviceSessionId,
            Seq: _seq,
            TitleId: env.PLAYFAB_TITLE_ID || "20ca2",
            Xuid: _xuid,
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
        return {
            correlationId: _correlationId, deviceSessionId: _deviceSessionId, seq: _seq, transaction: data
        };
    } catch (err) {
        const code = err.response?.data?.code || "";
        if (code === "AlreadyOwned") throw conflict("Already owned", {code});
        if (code === "InsufficientFunds") throw badRequest("Insufficient funds", err.response?.data);
        throw internal("Virtual transaction failed", err.response?.data || err.message);
    }
}

export async function bulkVirtualPurchase({items, mcToken, sharedOptions = {}}) {
    if (!Array.isArray(items) || items.length === 0) {
        throw badRequest("items is required");
    }
    if (!mcToken) throw badRequest("mcToken is required");

    const results = await mapWithConcurrency(items, BULK_VIRTUAL_PURCHASE_CONCURRENCY, async (item, index) => {
        const tx = await virtualPurchase({
            offerId: item.offerId,
            price: item.price,
            mcToken,
            xuid: item.xuid ?? sharedOptions.xuid,
            buildPlat: item.buildPlat ?? sharedOptions.buildPlat,
            clientIdPurchase: item.clientIdPurchase ?? sharedOptions.clientIdPurchase,
            correlationId: item.correlationId ?? sharedOptions.correlationId,
            deviceSessionId: item.deviceSessionId ?? sharedOptions.deviceSessionId,
            seq: item.seq ?? sharedOptions.seq,
            editionType: item.editionType ?? sharedOptions.editionType
        });

        return {
            index, offerId: item.offerId, price: item.price, ok: true, transaction: tx
        };
    });

    return results;
}

export const getBalances = getMinecraftBalances;
export const getInventory = getMinecraftInventory;
