import {env} from "../config/env.js";
import {badRequest, internal} from "../utils/httpError.js";
import {createHttp} from "../utils/http.js";

const http = createHttp(env.HTTP_TIMEOUT_MS);

export async function getEntityToken(sessionTicket, entity) {
    if (!sessionTicket) throw badRequest("sessionTicket is required");
    const url = `https://${env.PLAYFAB_TITLE_ID}.playfabapi.com/Authentication/GetEntityToken`;
    try {
        const {data} = await http.post(url, entity ? {Entity: entity} : {}, {
            headers: {
                "Content-Type": "application/json", "X-Authorization": sessionTicket, Accept: "application/json"
            }
        });
        return data.data;
    } catch (err) {
        throw internal("Failed to get PlayFab EntityToken", err.response?.data || err.message);
    }
}

export async function redeemOnestore(entityToken, redeemToken, xuid) {
    const url = `https://${env.PLAYFAB_TITLE_ID}.playfabapi.com/inventory/redeem`;
    try {
        const body = {
            MarketplaceData: {XboxToken: redeemToken, userId: xuid || undefined}, TargetMarketplace: "onestore"
        };
        await http.post(url, body, {
            headers: {
                "Content-Type": "application/json", "X-EntityToken": entityToken, Accept: "application/json"
            }
        });
        return {ok: true};
    } catch (err) {
        throw internal("Failed to redeem", err.response?.data || err.message);
    }
}
