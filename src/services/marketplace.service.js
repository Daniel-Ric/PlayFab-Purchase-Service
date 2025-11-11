import {env} from "../config/env.js";
import {badRequest, internal} from "../utils/httpError.js";
import {createHttp} from "../utils/http.js";

const http = createHttp(env.HTTP_TIMEOUT_MS);

export async function getCreatorsFromStoreConfig(mcToken) {
    try {
        const url = "https://store.mktpl.minecraft-services.net/api/v1.0/session/config";
        const {data} = await http.get(url, {headers: {authorization: mcToken, Accept: "application/json"}});
        const filters = data?.result?.storeFilters || [];
        const creator = filters.find(f => String(f.filterType).toLowerCase() === "creator");
        const toggles = Array.isArray(creator?.toggles) ? creator.toggles : [];
        const entries = toggles.map(t => [t.filterName, t.filterId]).sort((a, b) => a[0].localeCompare(b[0]));
        return Object.fromEntries(entries);
    } catch (err) {
        throw internal("Failed to fetch creators", err.response?.data || err.message);
    }
}

export async function getCreators(mcToken) {
    if (!mcToken) throw badRequest("mcToken is required");
    return await getCreatorsFromStoreConfig(mcToken);
}

export async function getCreatorSummary(creator, {marketplaceToken, xlinkToken} = {}) {
    if (!creator) throw badRequest("creator is required");
    if (!env.ENABLE_MARKETPLACE_API || !env.MARKETPLACE_API_BASE) {
        throw internal("Marketplace API disabled");
    }
    try {
        const url = `${env.MARKETPLACE_API_BASE.replace(/\/+$/, "")}/marketplace/summary/${encodeURIComponent(creator)}`;
        const auth = marketplaceToken || xlinkToken || "";
        const headers = {Accept: "application/json"};
        if (auth) headers.authorization = `Bearer ${auth}`;
        const {data} = await http.get(url, {headers});
        return data;
    } catch (err) {
        throw internal("Failed to fetch creator summary", err.response?.data || err.message);
    }
}

export async function getOfferDetails(offerId, {marketplaceToken, xlinkToken} = {}) {
    if (!offerId) throw badRequest("offerId is required");
    if (!env.ENABLE_MARKETPLACE_API || !env.MARKETPLACE_API_BASE) {
        throw internal("Marketplace API disabled");
    }
    try {
        const url = `${env.MARKETPLACE_API_BASE.replace(/\/+$/, "")}/marketplace/details/${encodeURIComponent(offerId)}`;
        const auth = marketplaceToken || xlinkToken || "";
        const headers = {Accept: "application/json"};
        if (auth) headers.authorization = `Bearer ${auth}`;
        const {data} = await http.get(url, {headers});
        return data;
    } catch (err) {
        throw internal("Failed to fetch offer details", err.response?.data || err.message);
    }
}
