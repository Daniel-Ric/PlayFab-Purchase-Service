import test from "node:test";
import assert from "node:assert/strict";
import {summarizeCreators} from "../src/utils/inventoryCreators.js";

test("summarizeCreators groups creators and tracks unknowns", () => {
    const entitlements = [
        {creator: "Alpha"},
        {creatorId: "Beta"},
        {creator: {id: "Gamma"}},
        {creator: {name: "Delta"}},
        {receipt: {creatorName: "Epsilon"}},
        {receipt: {creator: {displayName: "Zeta"}}},
        {offer: {creatorId: "Eta"}},
        {product: {creatorName: "Theta"}},
        {}
    ];

    const summary = summarizeCreators(entitlements);
    assert.equal(summary.totalItems, 9);
    assert.equal(summary.unknownCount, 1);
    assert.deepEqual(summary.creators, {
        Alpha: 1,
        Beta: 1,
        Delta: 1,
        Epsilon: 1,
        Eta: 1,
        Gamma: 1,
        Theta: 1,
        Zeta: 1
    });
});

test("summarizeCreators can include unknown bucket", () => {
    const entitlements = [{creator: "Alpha"}, {}];
    const summary = summarizeCreators(entitlements, {includeUnknown: true});
    assert.equal(summary.totalItems, 2);
    assert.equal(summary.unknownCount, 1);
    assert.deepEqual(summary.creators, {Alpha: 1, unknown: 1});
});

test("summarizeCreators maps creator ids using lookup", () => {
    const entitlements = [{creatorId: "master_player_account:abc"}, {creatorId: "master_player_account:def"}];
    const summary = summarizeCreators(entitlements, {
        creatorLookup: {
            "master_player_account:abc": "Alpha Studio",
            "master_player_account:def": "Beta Studio"
        }
    });
    assert.deepEqual(summary.creators, {"Alpha Studio": 1, "Beta Studio": 1});
});
