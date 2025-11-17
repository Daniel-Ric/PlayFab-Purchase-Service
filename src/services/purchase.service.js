import crypto from "node:crypto";
import {env} from "../config/env.js";
import {createHttp} from "../utils/http.js";
import {badRequest, conflict, internal} from "../utils/httpError.js";
import {getBalances as getMinecraftBalances, getInventory as getMinecraftInventory} from "./minecraft.service.js";

const http = createHttp(env.HTTP_TIMEOUT_MS);

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

export const getBalances = getMinecraftBalances;
export const getInventory = getMinecraftInventory;
