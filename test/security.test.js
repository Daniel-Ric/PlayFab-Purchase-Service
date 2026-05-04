import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "0123456789abcdef0123456789abcdef";

const {signJwt, jwtMiddleware} = await import("../src/utils/jwt.js");
const {badRequest} = await import("../src/utils/httpError.js");
const {errorHandler} = await import("../src/middleware/error.js");

function createRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
}

test("jwtMiddleware returns 401 for invalid JWT", () => {
    const req = {headers: {authorization: "Bearer invalid.token.value"}};
    let nextError = null;
    jwtMiddleware(req, {}, (err) => {
        nextError = err;
    });
    assert.ok(nextError);
    assert.equal(nextError.status, 401);
    assert.equal(nextError.code, "UNAUTHORIZED");
});

test("jwtMiddleware accepts valid JWT", () => {
    const token = signJwt({sub: "user-1"}, "1h");
    const req = {headers: {authorization: `Bearer ${token}`}};
    let nextError = null;
    jwtMiddleware(req, {}, (err) => {
        nextError = err;
    });
    assert.equal(nextError, undefined);
    assert.equal(req.user.sub, "user-1");
});

test("errorHandler hides raw 500 message and redacts sensitive text in logs", () => {
    const req = {id: "req-1", method: "GET", originalUrl: "/failure"};
    const res = createRes();
    const err = new Error("token=very-secret-value");
    const original = console.error;
    const logs = [];
    console.error = (...args) => {
        logs.push(args.join(" "));
    };

    try {
        errorHandler(err, req, res, () => {});
    } finally {
        console.error = original;
    }

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error.message, "Internal Server Error");
    assert.ok(!logs.join(" ").includes("very-secret-value"));
});

test("errorHandler keeps 400 message while redacting sensitive segments", () => {
    const req = {id: "req-2", method: "POST", originalUrl: "/bad"};
    const res = createRes();
    const err = badRequest("invalid token=secret");
    errorHandler(err, req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.message, "invalid token=[REDACTED]");
});
