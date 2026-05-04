import {env} from "../config/env.js";
import {badRequest, internal} from "../utils/httpError.js";
import {createHttp} from "../utils/http.js";

const http = createHttp(env.HTTP_TIMEOUT_MS);
export const CONTENT_KINDS = ["skinpack", "world", "persona", "addon", "resourcepack", "mashup"];
const CONTENT_KIND_SET = new Set(CONTENT_KINDS);

function normalizeArrayInput(input) {
    if (Array.isArray(input)) return input;
    if (typeof input === "string") return input.split(",");
    return [];
}

export function normalizeContentKinds(input) {
    const contentKinds = normalizeArrayInput(input)
        .map(value => String(value || "").trim().toLowerCase())
        .filter(Boolean);
    const invalid = contentKinds.filter(kind => !CONTENT_KIND_SET.has(kind));
    if (invalid.length > 0) {
        throw badRequest(`Unsupported contentKind: ${invalid.join(", ")}`, {allowed: CONTENT_KINDS});
    }
    return [...new Set(contentKinds)];
}

function localizedText(value) {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value !== "object") return null;
    return value.NEUTRAL || value["en-US"] || value["en_US"] || Object.values(value).find(v => typeof v === "string") || null;
}

function numberFrom(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function findMinecoinPrice(priceOptions) {
    const prices = priceOptions?.Prices || priceOptions?.prices;
    if (!Array.isArray(prices)) return null;
    for (const price of prices) {
        const amounts = price?.Amounts || price?.amounts;
        if (!Array.isArray(amounts)) continue;
        for (const amount of amounts) {
            const currency = String(amount?.ItemId || amount?.itemId || amount?.Id || amount?.id || "").toLowerCase();
            const value = numberFrom(amount?.Amount ?? amount?.amount);
            if (value !== null && (currency.includes("minecoin") || currency === "")) return value;
        }
    }
    return null;
}

function findStoreMinecoinPrice(storePrices) {
    if (!Array.isArray(storePrices)) return null;
    for (const storePrice of storePrices) {
        const amounts = storePrice?.amounts || storePrice?.Amounts;
        if (!Array.isArray(amounts)) continue;
        for (const amount of amounts) {
            const currency = String(amount?.currencyId || amount?.CurrencyId || amount?.itemId || amount?.ItemId || "").toLowerCase();
            const value = numberFrom(amount?.amount ?? amount?.Amount);
            if (value !== null && (currency.includes("minecoin") || currency === "")) return value;
        }
    }
    return null;
}

export function extractCatalogItems(payload) {
    const candidates = [
        payload?.items,
        payload?.Items,
        payload?.results,
        payload?.Results,
        payload?.data?.items,
        payload?.data?.Items,
        payload?.result?.items,
        payload?.result?.Items
    ];
    return candidates.find(Array.isArray) || [];
}

export function extractCatalogPurchaseItem(item) {
    const displayProperties = item?.DisplayProperties || item?.displayProperties || {};
    const offerId = item?.offerId || item?.OfferId || item?.id || item?.Id
        || (Array.isArray(item?.AlternateIds || item?.alternateIds)
            ? (() => {
                const alternateId = (item.AlternateIds || item.alternateIds)
                    .find(a => String(a?.Type || a?.type).toLowerCase() === "friendlyid");
                return alternateId?.Value || alternateId?.value;
            })()
            : null);
    const price = numberFrom(item?.price ?? item?.Price ?? item?.priceAmount ?? item?.PriceAmount
        ?? displayProperties.price ?? displayProperties.Price ?? displayProperties.priceAmount ?? displayProperties.PriceAmount)
        ?? findMinecoinPrice(item?.PriceOptions || item?.priceOptions)
        ?? findStoreMinecoinPrice(item?.StorePrices || item?.storePrices);
    if (!offerId || price === null || price < 0) return null;
    return {
        offerId: String(offerId),
        price,
        details: {
            source: "marketplace-content-kind",
            itemId: item?.Id || item?.id || null,
            contentKind: item?.ContentType || item?.contentType || null,
            title: localizedText(item?.Title || item?.title)
        }
    };
}

export async function searchPurchasableContentKindItems({
                                                           alias = env.MARKETPLACE_API_ALIAS,
                                                           contentKinds,
                                                           limit = 100,
                                                           filters = {},
                                                           query = {},
                                                           sort,
                                                           marketplaceToken,
                                                           xlinkToken
                                                       }) {
    const normalizedContentKinds = normalizeContentKinds(contentKinds);
    if (normalizedContentKinds.length === 0) throw badRequest("contentKind or contentKinds is required");
    if (!env.ENABLE_MARKETPLACE_API || !env.MARKETPLACE_API_BASE) {
        throw internal("Marketplace API disabled");
    }

    const requestBody = {
        query: query && typeof query === "object" ? query : {},
        filters: {
            ...(filters && typeof filters === "object" ? filters : {}),
            contentKinds: normalizedContentKinds,
            purchasable: true
        },
        sort: Array.isArray(sort) ? sort : []
    };
    const auth = marketplaceToken || xlinkToken || "";
    const headers = {Accept: "application/json", "Content-Type": "application/json"};
    if (auth) {
        const rawAuth = String(auth).trim();
        headers.authorization = rawAuth.toLowerCase().startsWith("bearer ") ? rawAuth : `Bearer ${rawAuth}`;
    }
    const url = `${env.MARKETPLACE_API_BASE.replace(/\/+$/, "")}/marketplace/search/advanced/${encodeURIComponent(alias)}`;

    try {
        const {data} = await http.post(url, requestBody, {headers});
        const catalogItems = extractCatalogItems(data);
        const requestedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
        const purchaseItems = [];
        const skipped = [];

        for (let index = 0; index < catalogItems.length && purchaseItems.length < requestedLimit; index++) {
            const purchaseItem = extractCatalogPurchaseItem(catalogItems[index]);
            if (purchaseItem) {
                purchaseItems.push(purchaseItem);
            } else {
                skipped.push({index, itemId: catalogItems[index]?.Id || catalogItems[index]?.id || null});
            }
        }

        if (purchaseItems.length === 0) {
            throw badRequest("No purchasable catalog items with offerId and price were found", {
                contentKinds: normalizedContentKinds,
                catalogCount: catalogItems.length
            });
        }

        return {
            alias,
            contentKinds: normalizedContentKinds,
            catalogCount: catalogItems.length,
            count: purchaseItems.length,
            skippedCount: skipped.length,
            skipped,
            items: purchaseItems
        };
    } catch (err) {
        if (err?.status) throw err;
        throw internal("Failed to search marketplace content kinds", err.response?.data || err.message);
    }
}

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
