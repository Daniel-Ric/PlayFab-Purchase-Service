import {env} from "../config/env.js";
import {badRequest, internal} from "../utils/httpError.js";
import {createHttp} from "../utils/http.js";

const http = createHttp(env.HTTP_TIMEOUT_MS);
export const CONTENT_KINDS = ["skinpack", "world", "persona", "addon", "resourcepack", "mashup"];
const CONTENT_KIND_SET = new Set(CONTENT_KINDS);
const CATALOG_TOKEN_TTL_MS = 10 * 60 * 1000;

let catalogTokenCache = {
    token: null,
    expiresAt: 0,
    pending: null
};

function marketplaceBaseUrl() {
    return env.MARKETPLACE_API_BASE.replace(/\/+$/, "");
}

function hasCatalogCredentials() {
    return !!(String(env.CATALOG_USERNAME || "").trim() && String(env.CATALOG_PASSWORD || "").trim());
}

export function formatBearerAuthorization(auth) {
    if (!auth) return null;
    const rawAuth = String(auth).trim();
    if (!rawAuth) return null;
    return rawAuth.toLowerCase().startsWith("bearer ") ? rawAuth : `Bearer ${rawAuth}`;
}

export function extractCatalogLoginToken(payload) {
    if (!payload || typeof payload !== "object") return null;
    const candidates = [
        payload.token,
        payload.accessToken,
        payload.jwt,
        payload.data?.token,
        payload.data?.accessToken,
        payload.result?.token,
        payload.result?.accessToken
    ];
    return candidates.find(value => typeof value === "string" && value.trim()) || null;
}

export function clearCatalogAuthCacheForTests() {
    catalogTokenCache = {
        token: null,
        expiresAt: 0,
        pending: null
    };
}

async function getCatalogLoginToken({forceRefresh = false} = {}) {
    if (!hasCatalogCredentials()) return null;

    const now = Date.now();
    if (!forceRefresh && catalogTokenCache.token && catalogTokenCache.expiresAt > now) {
        return catalogTokenCache.token;
    }
    if (!forceRefresh && catalogTokenCache.pending) {
        return catalogTokenCache.pending;
    }

    catalogTokenCache.pending = (async () => {
        try {
            const url = `${marketplaceBaseUrl()}/login`;
            const {data} = await http.post(url, {
                username: String(env.CATALOG_USERNAME || "").trim(),
                password: String(env.CATALOG_PASSWORD || "").trim()
            }, {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json"
                }
            });
            const token = extractCatalogLoginToken(data);
            if (!token) {
                throw internal("Catalog login did not return a bearer token");
            }
            catalogTokenCache.token = token;
            catalogTokenCache.expiresAt = Date.now() + CATALOG_TOKEN_TTL_MS;
            return token;
        } catch (err) {
            catalogTokenCache.token = null;
            catalogTokenCache.expiresAt = 0;
            if (err?.status) throw err;
            throw internal("Catalog login failed", {
                status: err.response?.status,
                body: err.response?.data || err.message
            });
        } finally {
            catalogTokenCache.pending = null;
        }
    })();

    return catalogTokenCache.pending;
}

async function buildMarketplaceHeaders(baseHeaders, authOptions = {}, {forceCatalogRefresh = false} = {}) {
    const directAuth = formatBearerAuthorization(authOptions.marketplaceToken || authOptions.xlinkToken);
    if (directAuth) {
        return {
            headers: {...baseHeaders, authorization: directAuth},
            usedCatalogAuth: false
        };
    }

    const catalogToken = await getCatalogLoginToken({forceRefresh: forceCatalogRefresh});
    if (!catalogToken) {
        return {
            headers: {...baseHeaders},
            usedCatalogAuth: false
        };
    }

    return {
        headers: {...baseHeaders, authorization: `Bearer ${catalogToken}`},
        usedCatalogAuth: true
    };
}

async function marketplaceRequest(method, url, {body, headers, authOptions} = {}) {
    const initialAuth = await buildMarketplaceHeaders(headers || {}, authOptions);
    try {
        const {data} = method === "post"
            ? await http.post(url, body, {headers: initialAuth.headers})
            : await http.get(url, {headers: initialAuth.headers});
        return data;
    } catch (err) {
        if (err.response?.status === 401 && initialAuth.usedCatalogAuth) {
            const retryAuth = await buildMarketplaceHeaders(headers || {}, authOptions, {forceCatalogRefresh: true});
            const {data} = method === "post"
                ? await http.post(url, body, {headers: retryAuth.headers})
                : await http.get(url, {headers: retryAuth.headers});
            return data;
        }
        throw err;
    }
}

function marketplaceErrorDetails(err, url) {
    return {
        url,
        status: err.response?.status,
        body: err.response?.data || err.message
    };
}

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
    let fallback = null;
    for (const price of prices) {
        const amounts = price?.Amounts || price?.amounts;
        if (!Array.isArray(amounts)) continue;
        for (const amount of amounts) {
            const currency = String(amount?.ItemId || amount?.itemId || amount?.CurrencyId || amount?.currencyId || amount?.Id || amount?.id || "").toLowerCase();
            const value = numberFrom(amount?.Amount ?? amount?.amount);
            if (value === null) continue;
            if (currency.includes("minecoin") || currency === "") return value;
            if (fallback === null) fallback = value;
        }
    }
    return fallback;
}

function findStoreMinecoinPrice(storePrices) {
    if (!Array.isArray(storePrices)) return null;
    let fallback = null;
    for (const storePrice of storePrices) {
        const amounts = storePrice?.amounts || storePrice?.Amounts;
        if (!Array.isArray(amounts)) continue;
        for (const amount of amounts) {
            const currency = String(amount?.currencyId || amount?.CurrencyId || amount?.itemId || amount?.ItemId || "").toLowerCase();
            const value = numberFrom(amount?.amount ?? amount?.Amount);
            if (value === null) continue;
            if (currency.includes("minecoin") || currency === "") return value;
            if (fallback === null) fallback = value;
        }
    }
    return fallback;
}

function extractCatalogPrice(item) {
    const displayProperties = item?.DisplayProperties || item?.displayProperties || {};
    return numberFrom(displayProperties.price ?? displayProperties.Price ?? displayProperties.priceAmount ?? displayProperties.PriceAmount)
        ?? numberFrom(item?.price)
        ?? numberFrom(item?.Price)
        ?? numberFrom(item?.priceAmount)
        ?? numberFrom(item?.PriceAmount)
        ?? findMinecoinPrice(item?.PriceOptions)
        ?? findMinecoinPrice(item?.priceOptions)
        ?? findMinecoinPrice(item?.Price)
        ?? findMinecoinPrice(item?.price)
        ?? findStoreMinecoinPrice(item?.StorePrices || item?.storePrices);
}

function firstNonEmptyString(values) {
    return values.find(value => typeof value === "string" && value.trim()) || null;
}

export function getCatalogOfferId(item) {
    if (!item || typeof item !== "object") return null;
    const displayProperties = item.DisplayProperties || item.displayProperties || {};
    const alternateIds = item.AlternateIds || item.alternateIds;
    const friendlyId = Array.isArray(alternateIds)
        ? firstNonEmptyString(alternateIds
            .filter(alt => String(alt?.Type || alt?.type).toLowerCase() === "friendlyid")
            .map(alt => alt?.Value || alt?.value))
        : null;
    return firstNonEmptyString([
        item.Id,
        item.OfferId,
        item.offerId,
        friendlyId,
        displayProperties.offerId,
        displayProperties.OfferId,
        item.FriendlyId,
        item.friendlyId,
        item.id
    ]);
}

export function isCatalogItemPurchasable(item) {
    const displayProperties = item?.DisplayProperties || item?.displayProperties || {};
    if (typeof displayProperties.purchasable === "boolean") return displayProperties.purchasable;
    if (typeof displayProperties.Purchasable === "boolean") return displayProperties.Purchasable;
    if (typeof item?.purchasable === "boolean") return item.purchasable;
    if (typeof item?.Purchasable === "boolean") return item.Purchasable;
    return false;
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
    const offerId = getCatalogOfferId(item);
    const purchasable = isCatalogItemPurchasable(item);
    const price = extractCatalogPrice(item);
    if (!offerId || !purchasable || price === null || price !== 0) return null;
    return {
        offerId: String(offerId),
        price,
        details: {
            source: "marketplace-content-kind",
            itemId: item?.Id || item?.id || null,
            contentKind: item?.ContentType || item?.contentType || null,
            title: localizedText(item?.Title || item?.title) || displayProperties.title || displayProperties.Title || null,
            purchasable,
            priceSource: "catalog"
        }
    };
}

function getCatalogSkipReason(item) {
    const offerId = getCatalogOfferId(item);
    const purchasable = isCatalogItemPurchasable(item);
    const price = extractCatalogPrice(item);
    if (!offerId) return "missing_offer_id";
    if (!purchasable) return "not_purchasable";
    if (price === null) return "missing_price";
    if (price < 0) return "negative_price";
    if (price !== 0) return "paid_price";
    return "unknown";
}

export function buildContentKindSearchRequest({contentKinds, filters = {}, query = {}, sort} = {}) {
    const normalizedContentKinds = normalizeContentKinds(contentKinds);
    const {price, Price, minPrice, maxPrice, priceRange, ...safeFilters} = filters && typeof filters === "object" ? filters : {};
    return {
        contentKinds: normalizedContentKinds,
        body: {
            query: query && typeof query === "object" ? query : {},
            filters: {
                ...safeFilters,
                contentKinds: normalizedContentKinds,
                purchasable: true
            },
            sort: Array.isArray(sort) ? sort : []
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
    const {contentKinds: normalizedContentKinds, body: requestBody} = buildContentKindSearchRequest({
        contentKinds,
        filters,
        query,
        sort
    });
    if (normalizedContentKinds.length === 0) throw badRequest("contentKind or contentKinds is required");
    if (!env.ENABLE_MARKETPLACE_API || !env.MARKETPLACE_API_BASE) {
        throw internal("Marketplace API disabled");
    }

    const headers = {Accept: "application/json", "Content-Type": "application/json"};
    const url = `${marketplaceBaseUrl()}/marketplace/search/advanced/${encodeURIComponent(alias)}`;

    try {
        const data = await marketplaceRequest("post", url, {
            body: requestBody,
            headers,
            authOptions: {marketplaceToken, xlinkToken}
        });
        const catalogItems = extractCatalogItems(data);
        const requestedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
        const purchaseItems = [];
        const skipped = [];

        for (let index = 0; index < catalogItems.length && purchaseItems.length < requestedLimit; index++) {
            const purchaseItem = extractCatalogPurchaseItem(catalogItems[index]);
            if (purchaseItem) {
                purchaseItems.push(purchaseItem);
            } else {
                skipped.push({
                    index,
                    itemId: catalogItems[index]?.Id || catalogItems[index]?.id || null,
                    reason: getCatalogSkipReason(catalogItems[index])
                });
            }
        }

        return {
            alias,
            contentKinds: normalizedContentKinds,
            catalogCount: catalogItems.length,
            count: purchaseItems.length,
            skippedCount: skipped.length,
            skipped,
            noClaimableReason: purchaseItems.length === 0 ? "no_free_purchasable_items" : null,
            items: purchaseItems
        };
    } catch (err) {
        if (err?.status) throw err;
        throw internal("Failed to search marketplace content kinds", marketplaceErrorDetails(err, url));
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
    const url = `${marketplaceBaseUrl()}/marketplace/summary/${encodeURIComponent(creator)}`;
    try {
        return await marketplaceRequest("get", url, {
            headers: {Accept: "application/json"},
            authOptions: {marketplaceToken, xlinkToken}
        });
    } catch (err) {
        throw internal("Failed to fetch creator summary", marketplaceErrorDetails(err, url));
    }
}

export async function getOfferDetails(offerId, {marketplaceToken, xlinkToken} = {}) {
    if (!offerId) throw badRequest("offerId is required");
    if (!env.ENABLE_MARKETPLACE_API || !env.MARKETPLACE_API_BASE) {
        throw internal("Marketplace API disabled");
    }
    const url = `${marketplaceBaseUrl()}/marketplace/details/${encodeURIComponent(offerId)}`;
    try {
        return await marketplaceRequest("get", url, {
            headers: {Accept: "application/json"},
            authOptions: {marketplaceToken, xlinkToken}
        });
    } catch (err) {
        throw internal("Failed to fetch offer details", marketplaceErrorDetails(err, url));
    }
}
