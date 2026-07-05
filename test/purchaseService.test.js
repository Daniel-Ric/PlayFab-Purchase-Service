import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "0123456789abcdef0123456789abcdef";

const {
    buildVirtualPurchasePayload,
    classifyVirtualPurchaseError
} = await import("../src/services/purchase.service.js");

test("buildVirtualPurchasePayload includes optional sale store id", () => {
    const payload = buildVirtualPurchasePayload({
        offerId: "offer-1",
        price: 330,
        storeId: " sale-store-1 ",
        xuid: "123456",
        buildPlat: 5,
        clientIdPurchase: "client-1",
        correlationId: "corr-1",
        deviceSessionId: "device-1",
        seq: 7,
        editionType: "win10"
    });

    assert.equal(payload.OfferId, "offer-1");
    assert.equal(payload.StoreId, "sale-store-1");
    assert.equal(payload.VirtualCurrency.Amount, "330");
});

test("buildVirtualPurchasePayload keeps legacy empty store id by default", () => {
    const payload = buildVirtualPurchasePayload({
        offerId: "offer-1",
        price: 660,
        xuid: "123456",
        buildPlat: 5,
        clientIdPurchase: "client-1",
        correlationId: "corr-1",
        deviceSessionId: "device-1",
        seq: 7,
        editionType: "win10"
    });

    assert.equal(payload.StoreId, "");
});

test("classifyVirtualPurchaseError maps nested price mismatch to a client error", () => {
    const payload = {
        namespace: "ServiceRuntime",
        code: "PlayFabError",
        message: "Virtual transaction failed",
        details: {
            namespace: "ServiceRuntime",
            code: "PriceMismatch",
            message: "The item cannot be purchased at the specified price.",
            customData: {}
        }
    };
    const err = classifyVirtualPurchaseError(payload);

    assert.equal(err.status, 400);
    assert.equal(err.code, "BAD_REQUEST");
    assert.equal(err.message, "Price mismatch");
    assert.equal(err.details, payload);
});

test("classifyVirtualPurchaseError maps non-stackable purchased items to already owned", () => {
    const payload = {
        namespace: "ServiceRuntime",
        code: "InternalServerError",
        message: "Item is not stackable OfferId [995c6233-eebc-4341-817a-d3ce3ccd71aa] PackId [1e2866ad-d30d-4be6-988b-5dc868d91156] EntitlementId [7d33ce2d-6fdd-4cbb-83cd-4893a8c12d8f] StackId [7d1f6ee6-919a-4d20-8c82-d29efda53718] Ownership [Purchased] IsStackable [False] Amount [1]",
        customData: {}
    };
    const err = classifyVirtualPurchaseError(payload);

    assert.equal(err.status, 409);
    assert.equal(err.code, "CONFLICT");
    assert.equal(err.message, "Already owned");
    assert.equal(err.details, payload);
});

test("classifyVirtualPurchaseError maps unsupported subscriptions to a client error", () => {
    const err = classifyVirtualPurchaseError({
        namespace: "ServiceRuntime",
        code: "PlayFabError",
        message: "Subscription is not supported.",
        customData: {marketplaceErrorCode: ""}
    });

    assert.equal(err.status, 400);
    assert.equal(err.code, "BAD_REQUEST");
    assert.equal(err.message, "Subscription offers are not supported by virtual purchases");
    assert.equal(err.details.message, "Subscription is not supported.");
});

test("classifyVirtualPurchaseError keeps unknown upstream failures unclassified", () => {
    assert.equal(classifyVirtualPurchaseError({code: "PlayFabError", message: "Temporary failure"}), null);
});
