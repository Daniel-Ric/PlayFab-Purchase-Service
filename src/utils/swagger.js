import swaggerJSDoc from "swagger-jsdoc";
import {env} from "../config/env.js";

const serverUrl = env.SWAGGER_SERVER_URL || `http://localhost:${env.PORT}`;

const options = {
    definition: {
        openapi: "3.0.3",
        info: {
            title: "Minecraft Marketplace Purchase Addon",
            version: "1.2.0",
            description: "Standalone purchase API for xLink"
        },
        servers: [{url: serverUrl, description: env.NODE_ENV}],
        tags: [{name: "Health", description: "Service readiness and liveness"}, {
            name: "Marketplace",
            description: "Creator and offer metadata"
        }, {name: "Inventory", description: "Player balances and entitlements"}, {
            name: "Purchase",
            description: "Quoting and executing purchases"
        }, {name: "Debug", description: "Utilities helpful during development"}],
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                    description: "JWT issued by the Purchase API for client authentication"
                }
            }
        },
        security: [{BearerAuth: []}],
        paths: {
            "/healthz": {
                get: {
                    tags: ["Health"],
                    summary: "Liveness probe",
                    description: "Returns a simple OK payload indicating the service is running.",
                    security: [],
                    responses: {200: {description: "Service is alive"}}
                }
            }, "/readyz": {
                get: {
                    tags: ["Health"],
                    summary: "Readiness probe",
                    description: "Signals that the service is ready to accept traffic.",
                    security: [],
                    responses: {200: {description: "Service is ready"}}
                }
            }, "/marketplace/creators": {
                get: {
                    tags: ["Marketplace"],
                    summary: "List marketplace creators",
                    description: "Retrieves a map of creator display names and identifiers available to the current Minecraft session.",
                    parameters: [{
                        in: "header",
                        name: "x-mc-token",
                        required: true,
                        schema: {type: "string"},
                        description: "Minecraft authorization header for the player session"
                    }],
                    responses: {200: {description: "Dictionary of creators keyed by display name"}}
                }
            }, "/marketplace/creator/summary": {
                get: {
                    tags: ["Marketplace"],
                    summary: "Creator catalog summary",
                    description: "Returns a condensed list of offers for a given creator. When marketplace integration is enabled, a marketplace token or xLink token may be provided.",
                    parameters: [{
                        in: "query",
                        name: "creator",
                        required: true,
                        schema: {type: "string"},
                        description: "Creator identifier"
                    }, {
                        in: "header",
                        name: "x-marketplace-token",
                        required: false,
                        schema: {type: "string"},
                        description: "Bearer token issued by the Marketplace service (optional)"
                    }, {
                        in: "header",
                        name: "x-xlink-token",
                        required: false,
                        schema: {type: "string"},
                        description: "Bearer token issued by xLink for internal requests (optional)"
                    }],
                    responses: {200: {description: "Array of summarized offers for the creator"}}
                }
            }, "/marketplace/offer/details": {
                get: {
                    tags: ["Marketplace"],
                    summary: "Offer details",
                    description: "Fetches detailed information for a specific offer, including price and display properties.",
                    parameters: [{
                        in: "query",
                        name: "offerId",
                        required: true,
                        schema: {type: "string"},
                        description: "Offer identifier"
                    }, {
                        in: "header",
                        name: "x-marketplace-token",
                        required: false,
                        schema: {type: "string"},
                        description: "Bearer token issued by the Marketplace service (optional)"
                    }, {
                        in: "header",
                        name: "x-xlink-token",
                        required: false,
                        schema: {type: "string"},
                        description: "Bearer token issued by xLink for internal requests (optional)"
                    }],
                    responses: {200: {description: "Offer detail object"}}
                }
            }, "/inventory/balances": {
                get: {
                    tags: ["Inventory"],
                    summary: "Get virtual currency balances",
                    description: "Returns the player's current virtual currency balances (e.g., Minecoins) for the active Minecraft session.",
                    parameters: [{
                        in: "header",
                        name: "x-mc-token",
                        required: true,
                        schema: {type: "string"},
                        description: "Minecraft authorization header for the player session"
                    }],
                    responses: {200: {description: "Balance payload including currency types and amounts"}}
                }
            }, "/inventory/entitlements": {
                get: {
                    tags: ["Inventory"],
                    summary: "Get player entitlements",
                    description: "Retrieves the player's inventory entitlements. Receipts can optionally be included.",
                    parameters: [{
                        in: "header",
                        name: "x-mc-token",
                        required: true,
                        schema: {type: "string"},
                        description: "Minecraft authorization header for the player session"
                    }, {
                        in: "query",
                        name: "includeReceipt",
                        required: false,
                        schema: {type: "boolean", default: false},
                        description: "If true, include purchase receipts with each entitlement"
                    }],
                    responses: {200: {description: "List of entitlements owned by the player"}}
                }
            }, "/purchase/quote": {
                post: {
                    tags: ["Purchase"],
                    summary: "Quote an offer",
                    description: "Resolves price and metadata for an offer before executing a purchase. MC token or PlayFab session may be provided; marketplace/xLink tokens are optional when integration is enabled.",
                    parameters: [{
                        in: "header",
                        name: "x-mc-token",
                        required: false,
                        schema: {type: "string"},
                        description: "Minecraft authorization header for the player session"
                    }, {
                        in: "header",
                        name: "x-playfab-session",
                        required: false,
                        schema: {type: "string"},
                        description: "PlayFab SessionTicket; used to mint an MC token if not provided"
                    }, {
                        in: "header",
                        name: "x-marketplace-token",
                        required: false,
                        schema: {type: "string"},
                        description: "Bearer token issued by the Marketplace service (optional)"
                    }, {
                        in: "header",
                        name: "x-xlink-token",
                        required: false,
                        schema: {type: "string"},
                        description: "Bearer token issued by xLink for internal requests (optional)"
                    }],
                    requestBody: {
                        required: true, content: {
                            "application/json": {
                                schema: {
                                    type: "object", required: ["offerId"], properties: {
                                        offerId: {type: "string", description: "Offer identifier to quote"},
                                        price: {
                                            type: "integer",
                                            description: "Optional expected price for client-side validation"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {200: {description: "Quote payload including resolved price and offer details"}}
                }
            }, "/purchase/virtual": {
                post: {
                    tags: ["Purchase"],
                    summary: "Execute a virtual currency purchase",
                    description: "Performs a Minecoin purchase for the given offer using the active Minecraft session. On success, returns the transaction data.",
                    parameters: [{
                        in: "header",
                        name: "x-mc-token",
                        required: false,
                        schema: {type: "string"},
                        description: "Minecraft authorization header for the player session"
                    }, {
                        in: "header",
                        name: "x-playfab-session",
                        required: false,
                        schema: {type: "string"},
                        description: "PlayFab SessionTicket; used to mint an MC token if not provided"
                    }, {
                        in: "header",
                        name: "x-playfab-id",
                        required: false,
                        schema: {type: "string"},
                        description: "Optional PlayFab entity identifier of the player"
                    }],
                    requestBody: {
                        required: true, content: {
                            "application/json": {
                                schema: {
                                    type: "object", required: ["offerId", "price"], properties: {
                                        offerId: {type: "string", description: "Offer to purchase"},
                                        price: {type: "integer", description: "Price in Minecoins to debit"},
                                        correlationId: {
                                            type: "string",
                                            description: "Client-provided correlation ID (optional)"
                                        },
                                        deviceSessionId: {
                                            type: "string",
                                            description: "Client-provided device session ID (optional)"
                                        },
                                        seq: {
                                            type: "integer",
                                            description: "Client-provided sequence number (optional)"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {200: {description: "Purchase result including transaction IDs and post-purchase state"}}
                }
            }, "/debug/decode-token": {
                post: {
                    tags: ["Debug"],
                    summary: "Decode token",
                    description: "Accepts a single token or a map of tokens and returns decoded headers, payload, kind, and expiration metadata when available.",
                    requestBody: {
                        required: true, content: {
                            "application/json": {
                                schema: {
                                    oneOf: [{
                                        type: "object",
                                        required: ["token"],
                                        properties: {
                                            token: {
                                                type: "string",
                                                description: "A single token string to decode"
                                            }
                                        }
                                    }, {
                                        type: "object",
                                        required: ["tokens"],
                                        properties: {
                                            tokens: {
                                                type: "object",
                                                additionalProperties: {type: "string"},
                                                description: "Key-value map of token names to token strings"
                                            }
                                        }
                                    }]
                                }
                            }
                        }
                    },
                    responses: {200: {description: "Decoded representation of supplied token(s)"}}
                }
            }
        }
    }, apis: []
};

export const swaggerSpec = swaggerJSDoc(options);
