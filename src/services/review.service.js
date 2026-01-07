import {env} from "../config/env.js";
import {createHttp} from "../utils/http.js";
import {badRequest, forbidden, HttpError, internal} from "../utils/httpError.js";
import {getInventory} from "./minecraft.service.js";
import {getEntityToken} from "./playfab.service.js";

const http = createHttp(env.HTTP_TIMEOUT_MS);

function norm(s) {
    return String(s || "").trim().toLowerCase();
}

function matchString(v, needle) {
    const a = norm(v);
    const b = norm(needle);
    if (!a || !b) return false;
    if (a === b) return true;
    return a.includes(b);
}

function containsNeedle(root, needle) {
    const seen = new Set();
    const stack = [root];
    let steps = 0;

    while (stack.length) {
        const cur = stack.pop();
        steps++;
        if (steps > 6000) return false;

        if (cur == null) continue;

        const t = typeof cur;
        if (t === "string") {
            if (matchString(cur, needle)) return true;
            continue;
        }
        if (t === "number" || t === "boolean") continue;

        if (t === "object") {
            if (seen.has(cur)) continue;
            seen.add(cur);

            if (Array.isArray(cur)) {
                for (let i = 0; i < cur.length; i++) stack.push(cur[i]);
            } else {
                const vals = Object.values(cur);
                for (let i = 0; i < vals.length; i++) stack.push(vals[i]);
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

async function resolveEntityToken(sessionTicket, playfabId) {
    if (!sessionTicket) throw badRequest("x-playfab-session is required");
    if (!playfabId) throw badRequest("x-playfab-id is required");
    const t = await getEntityToken(sessionTicket, {Id: playfabId, Type: "master_player_account"});
    const tok = String(t || "").trim();
    if (!tok) throw internal("Failed to resolve EntityToken");
    return tok;
}

async function postRating(entityToken, itemId, rating, isInstalled) {
    const url = `https://${env.PLAYFAB_TITLE_ID}.playfabapi.com/Catalog/CreateOrUpdateReview`;
    const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        "accept-language": env.ACCEPT_LANGUAGE,
        "X-EntityToken": entityToken
    };

    const body = {
        ItemId: itemId, Review: {
            IsInstalled: !!isInstalled, Rating: rating
        }
    };

    try {
        const {data} = await http.post(url, body, {headers});
        if (data && typeof data.code === "number" && data.code !== 200) throw internal("Rating failed", data);
        return data?.data ?? data ?? {};
    } catch (err) {
        if (err instanceof HttpError) throw err;
        throw internal("Rating failed", err.response?.data || err.message);
    }
}

export async function submitItemRating({mcToken, sessionTicket, playfabId, itemId, rating, isInstalled = false}) {
    if (!itemId) throw badRequest("itemId is required");
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw badRequest("rating must be an integer between 1 and 5");
    }

    await assertOwned(mcToken, itemId);

    const entityToken = await resolveEntityToken(sessionTicket, playfabId);
    const result = await postRating(entityToken, itemId, rating, isInstalled);

    return {ok: true, result};
}
