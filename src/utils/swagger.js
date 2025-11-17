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
                    summary: "Get creator summary",
                    description: "Fetches aggregated marketplace information for a specific creator.",
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
                        description: "Marketplace API bearer token"
                    }, {
                        in: "header",
                        name: "x-xlink-token",
                        required: false,
                        schema: {type: "string"},
                        description: "xLink bearer token used as a fallback when marketplace token is not provided"
                    }],
                    responses: {
                        200: {description: "Creator summary payload"},
                        500: {description: "Marketplace API disabled or failed"}
                    }
                }
            }, "/marketplace/offer/details": {
                get: {
                    tags: ["Marketplace"],
                    summary: "Get offer details",
                    description: "Retrieves detailed marketplace information for a specific offer.",
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
                        description: "Marketplace API bearer token"
                    }, {
                        in: "header",
                        name: "x-xlink-token",
                        required: false,
                        schema: {type: "string"},
                        description: "xLink bearer token used as a fallback when marketplace token is not provided"
                    }],
                    responses: {
                        200: {description: "Offer details payload"},
                        500: {description: "Marketplace API disabled or failed"}
                    }
                }
            }, "/inventory/balances": {
                get: {
                    tags: ["Inventory"],
                    summary: "Get virtual currency balances",
                    description: "Returns the player's current virtual currency balances for the active Minecraft session.",
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
                    description: "Resolves price and optional metadata for an offer before executing a purchase. Provide MC token or PlayFab session.",
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
                    }],
                    requestBody: {
                        required: true, content: {
                            "application/json": {
                                schema: {
                                    type: "object", required: ["offerId", "price"], properties: {
                                        offerId: {type: "string", description: "Offer identifier to quote"},
                                        price: {type: "integer", description: "Price in Minecoins to use"},
                                        details: {
                                            type: "object", description: "Optional client-supplied details"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {200: {description: "Quote payload including resolved price and optional details"}}
                }
            }, "/purchase/virtual": {
                post: {
                    tags: ["Purchase"],
                    summary: "Execute a virtual currency purchase",
                    description: "Performs a Minecoin purchase for the given offer using the active Minecraft session.",
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
                    }],
                    requestBody: {
                        required: true, content: {
                            "application/json": {
                                schema: {
                                    type: "object", required: ["offerId", "price"], properties: {
                                        offerId: {type: "string", description: "Offer to purchase"},
                                        price: {type: "integer", description: "Price in Minecoins to debit"},
                                        xuid: {type: "string"},
                                        includePostState: {type: "boolean", default: true}
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: {
                            description: "Purchase result including transaction IDs and optional post state such as balances and inventory"
                        }
                    }
                }
            }, "/purchase/marketplace/creators": {
                get: {
                    tags: ["Purchase"],
                    summary: "List marketplace creators via purchase flow",
                    description: "Retrieves the list of creators using either a Minecraft token or a PlayFab session that is upgraded to an MC token.",
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
                    }],
                    responses: {
                        200: {description: "Dictionary of creators keyed by display name including a total count"}
                    }
                }
            }, "/purchase/inventory/balances": {
                get: {
                    tags: ["Purchase"],
                    summary: "Get virtual currency balances via purchase flow",
                    description: "Returns the player's virtual currency balances using either a Minecraft token or a PlayFab session that is upgraded to an MC token.",
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
                    }],
                    responses: {200: {description: "Balance payload including currency types and amounts"}}
                }
            }, "/purchase/inventory/entitlements": {
                get: {
                    tags: ["Purchase"],
                    summary: "Get player entitlements via purchase flow",
                    description: "Retrieves the player's inventory entitlements using either a Minecraft token or a PlayFab session that is upgraded to an MC token.",
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
                        in: "query",
                        name: "includeReceipt",
                        required: false,
                        schema: {type: "boolean", default: false},
                        description: "If true, include purchase receipts with each entitlement"
                    }],
                    responses: {200: {description: "List of entitlements owned by the player"}}
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
                                        type: "object", required: ["token"], properties: {token: {type: "string"}}
                                    }, {
                                        type: "object", required: ["tokens"], properties: {
                                            tokens: {type: "object", additionalProperties: {type: "string"}}
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
