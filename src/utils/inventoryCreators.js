function normalizeCreator(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number") return String(value);
    if (typeof value !== "object") return "";
    const candidates = [value.id, value.creatorId, value.name, value.displayName, value.creatorName];
    for (const candidate of candidates) {
        const normalized = normalizeCreator(candidate);
        if (normalized) return normalized;
    }
    return "";
}

function resolveCreator(entitlement) {
    if (!entitlement || typeof entitlement !== "object") return "";
    const candidates = [
        entitlement.creator,
        entitlement.creatorId,
        entitlement.creatorName,
        entitlement.creatorDisplayName,
        entitlement.creator?.id,
        entitlement.creator?.creatorId,
        entitlement.creator?.name,
        entitlement.creator?.displayName,
        entitlement.creator?.creatorName,
        entitlement.receipt?.creator,
        entitlement.receipt?.creatorId,
        entitlement.receipt?.creatorName,
        entitlement.receipt?.creatorDisplayName,
        entitlement.receipt?.creator?.id,
        entitlement.receipt?.creator?.creatorId,
        entitlement.receipt?.creator?.name,
        entitlement.receipt?.creator?.displayName,
        entitlement.receipt?.creator?.creatorName,
        entitlement.offer?.creator,
        entitlement.offer?.creatorId,
        entitlement.offer?.creatorName,
        entitlement.offer?.creatorDisplayName,
        entitlement.offer?.creator?.id,
        entitlement.offer?.creator?.creatorId,
        entitlement.offer?.creator?.name,
        entitlement.offer?.creator?.displayName,
        entitlement.offer?.creator?.creatorName,
        entitlement.product?.creator,
        entitlement.product?.creatorId,
        entitlement.product?.creatorName,
        entitlement.product?.creatorDisplayName,
        entitlement.product?.creator?.id,
        entitlement.product?.creator?.creatorId,
        entitlement.product?.creator?.name,
        entitlement.product?.creator?.displayName,
        entitlement.product?.creator?.creatorName
    ];
    for (const candidate of candidates) {
        const normalized = normalizeCreator(candidate);
        if (normalized) return normalized;
    }
    return "";
}

export function summarizeCreators(entitlements, {
    includeUnknown = false,
    unknownKey = "unknown",
    creatorLookup = null
} = {}) {
    const items = Array.isArray(entitlements) ? entitlements : [];
    const counts = new Map();
    let unknownCount = 0;
    const unknownLabel = String(unknownKey || "").trim() || "unknown";
    const lookup = creatorLookup && typeof creatorLookup === "object" ? creatorLookup : null;

    for (const entitlement of items) {
        const resolved = resolveCreator(entitlement);
        if (resolved) {
            const mapped = lookup && lookup[resolved] ? lookup[resolved] : resolved;
            counts.set(mapped, (counts.get(mapped) || 0) + 1);
            continue;
        }
        unknownCount += 1;
        if (includeUnknown) {
            counts.set(unknownLabel, (counts.get(unknownLabel) || 0) + 1);
        }
    }

    const creators = Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    return {totalItems: items.length, unknownCount, creators};
}
