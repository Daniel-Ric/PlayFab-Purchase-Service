import {env} from "../config/env.js";
import {createHttp} from "../utils/http.js";
import {badRequest, forbidden, HttpError, internal} from "../utils/httpError.js";
import {getInventory} from "./minecraft.service.js";
import {getEntityTokenForPlayer} from "./playfab.service.js";

const http = createHttp(env.HTTP_TIMEOUT_MS);

function norm(value) {
    return String(value || "").trim().toLowerCase();
}

function matchString(value, needle) {
    const left = norm(value);
    const right = norm(needle);
    if (!left || !right) return false;
    if (left === right) return true;
    return left.includes(right);
}

function containsNeedle(root, needle) {
    const seen = new Set();
    const stack = [root];
    let steps = 0;

    while (stack.length) {
        const current = stack.pop();
        steps++;
        if (steps > 6000) return false;

        if (current == null) continue;

        const type = typeof current;
        if (type === "string") {
            if (matchString(current, needle)) return true;
            continue;
        }
        if (type === "number" || type === "boolean") continue;

        if (type === "object") {
            if (seen.has(current)) continue;
            seen.add(current);

            if (Array.isArray(current)) {
                for (let i = 0; i < current.length; i++) stack.push(current[i]);
            } else {
                const values = Object.values(current);
                for (let i = 0; i < values.length; i++) stack.push(values[i]);
            }
        }
    }

    return false;
}

async function assertOwned(mcToken, itemId) {
    if (!mcToken) throw badRequest("mcToken is required");
    if (!itemId) throw badRequest("itemId is required");
    const entitlements = await getInventory(mcToken, true);
    const ok = Array.isArray(entitlements) && containsNeedle(entitlements, itemId);
    if (!ok) throw forbidden("Item not owned");
    return {ok: true};
}

async function fetchPublishedItem(entityToken, itemId, eTag) {
    const url = `https://${env.PLAYFAB_TITLE_ID}.playfabapi.com/Catalog/GetPublishedItem`;
    const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        "accept-language": env.ACCEPT_LANGUAGE,
        "X-EntityToken": entityToken
    };
    const body = {ETag: eTag || "", ItemId: itemId};

    try {
        const {data} = await http.post(url, body, {headers});
        if (data && typeof data.code === "number" && data.code !== 200) {
            throw internal("Failed to get published item", data);
        }
        return data ?? {};
    } catch (err) {
        if (err instanceof HttpError) throw err;
        throw internal("Failed to get published item", err.response?.data || err.message);
    }
}

export async function getPublishedItemDownload({
    mcToken,
    entityToken,
    sessionTicket,
    playfabId,
    itemId,
    eTag = "",
    enforceOwnership = false
}) {
    if (!itemId) throw badRequest("itemId is required");
    if (typeof eTag !== "string") throw badRequest("eTag must be a string");

    if (enforceOwnership) await assertOwned(mcToken, itemId);

    let token = String(entityToken || "").trim();
    if (!token) token = await getEntityTokenForPlayer(sessionTicket, playfabId);
    return await fetchPublishedItem(token, itemId, eTag);
}
