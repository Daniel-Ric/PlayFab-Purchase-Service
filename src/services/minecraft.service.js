import {randomUUID} from "crypto";
import {env} from "../config/env.js";
import {internal} from "../utils/httpError.js";
import {createHttp} from "../utils/http.js";

const http = createHttp(env.HTTP_TIMEOUT_MS);
const AUTH_BASE = "https://authorization.franchise.minecraft-services.net/api/v1.0/session/start";
const ENTITLEMENTS_BASE = "https://entitlements.mktpl.minecraft-services.net/api/v1.0";

export async function getMCTokenFromSession(sessionTicket) {
    try {
        if (!sessionTicket) throw internal("Failed to get Minecraft token", "SessionTicket missing");
        const payload = {
            user: {language: "en", languageCode: "en-US", regionCode: "US", token: sessionTicket, tokentype: "playfab"},
            device: {
                applicationType: "MinecraftPE",
                memory: Math.floor(Math.random() * 1000000000000) + 1,
                id: randomUUID(),
                gameVersion: env.MC_GAME_VERSION,
                platform: env.MC_PLATFORM,
                playFabTitleId: env.PLAYFAB_TITLE_ID,
                storePlatform: "uwp.store",
                treatmentOverrides: null,
                type: env.MC_PLATFORM
            }
        };
        const res = await http.post(AUTH_BASE, payload, {
            headers: {
                Accept: "application/json", "content-type": "application/json", "user-agent": "MCPE/UWP"
            }
        });
        if (res.data?.result?.authorizationHeader) return res.data.result.authorizationHeader;
        throw internal("Failed to get Minecraft token", res.data);
    } catch (err) {
        throw internal("Failed to get Minecraft token", err.response?.data || err.message);
    }
}

export async function getBalances(mcToken) {
    try {
        const url = `${ENTITLEMENTS_BASE}/currencies/virtual/balances`;
        const {data} = await http.post(url, {}, {headers: {authorization: mcToken, Accept: "application/json"}});
        return data;
    } catch (err) {
        throw internal("Failed to get balances", err.response?.data || err.message);
    }
}

export async function getInventory(mcToken, includeReceipt = false) {
    try {
        const url = `${ENTITLEMENTS_BASE}/player/inventory?includeReceipt=${includeReceipt ? "true" : "false"}`;
        const {data} = await http.get(url, {headers: {authorization: mcToken, Accept: "application/json"}});
        return data?.result?.inventory?.entitlements || [];
    } catch (err) {
        throw internal("Failed to get inventory", err.response?.data || err.message);
    }
}
