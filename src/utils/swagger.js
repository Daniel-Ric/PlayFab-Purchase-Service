import swaggerJSDoc from "swagger-jsdoc";
import {env} from "../config/env.js";

const serverUrl = env.SWAGGER_SERVER_URL || `http://localhost:${env.PORT}`;

const options = {
    definition: {
        openapi: "3.0.3", info: {
            title: "Minecraft Marketplace Purchase Add-on",
            version: "1.2.0",
            description: "Standalone purchase API used by xLink to interact with the Minecraft Marketplace."
        }, servers: [{
            url: serverUrl, description: env.NODE_ENV
        }], tags: [{
            name: "Health", description: "Service health and readiness endpoints."
        }, {
            name: "Marketplace", description: "Creator and offer metadata from the Minecraft Marketplace."
        }, {
            name: "Inventory", description: "Virtual currency balances and owned entitlements."
        }, {
            name: "Purchase", description: "Quoting and executing Minecraft Marketplace purchases."
        }, {
            name: "Debug", description: "Developer utilities useful during integration and testing."
        }], components: {
            securitySchemes: {
                BearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                    description: "JWT issued by the Purchase API for authenticating client requests."
                }
            }
        }, security: [{BearerAuth: []}], paths: {
            "/healthz": {
                get: {
                    tags: ["Health"],
                    summary: "Liveness probe",
                    description: "Returns a simple payload indicating that the service process is running.",
                    security: [],
                    responses: {
                        200: {description: "Service is alive."}
                    }
                }
            }, "/readyz": {
                get: {
                    tags: ["Health"],
                    summary: "Readiness probe",
                    description: "Indicates that the service is ready to accept traffic.",
                    security: [],
                    responses: {
                        200: {description: "Service is ready."}
                    }
                }
            }, "/marketplace/creators": {
                get: {
                    tags: ["Marketplace"],
                    summary: "List marketplace creators",
                    description: "Returns a map of creator display names to creator identifiers available for the current Minecraft session.",
                    parameters: [{
                        in: "header",
                        name: "x-mc-token",
                        required: true,
                        schema: {type: "string"},
                        description: "Minecraft authorization header for the player session."
                    }],
                    responses: {
                        200: {description: "Dictionary of creators keyed by display name."}
                    }
                }
            }, "/marketplace/creator/summary": {
                get: {
                    tags: ["Marketplace"],
                    summary: "Get creator summary",
                    description: "Fetches aggregated marketplace information and summary data for a specific creator.",
                    parameters: [{
                        in: "query",
                        name: "creator",
                        required: true,
                        schema: {type: "string"},
                        description: "Creator identifier."
                    }, {
                        in: "header",
                        name: "x-marketplace-token",
                        required: false,
                        schema: {type: "string"},
                        description: "Marketplace API bearer token."
                    }, {
                        in: "header",
                        name: "x-xlink-token",
                        required: false,
                        schema: {type: "string"},
                        description: "xLink bearer token used as a fallback when a marketplace token is not provided."
                    }],
                    responses: {
                        200: {description: "Creator summary payload."},
                        500: {description: "Marketplace API is disabled or the request to it failed."}
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
                        description: "Offer identifier."
                    }, {
                        in: "header",
                        name: "x-marketplace-token",
                        required: false,
                        schema: {type: "string"},
                        description: "Marketplace API bearer token."
                    }, {
                        in: "header",
                        name: "x-xlink-token",
                        required: false,
                        schema: {type: "string"},
                        description: "xLink bearer token used as a fallback when a marketplace token is not provided."
                    }],
                    responses: {
                        200: {description: "Offer details payload."},
                        500: {description: "Marketplace API is disabled or the request to it failed."}
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
                        description: "Minecraft authorization header for the player session."
                    }],
                    responses: {
                        200: {description: "Balance payload including currency types and amounts."}
                    }
                }
            }, "/inventory/entitlements": {
                get: {
                    tags: ["Inventory"],
                    summary: "Get player entitlements",
                    description: "Retrieves the player's inventory entitlements. Purchase receipts can optionally be included.",
                    parameters: [{
                        in: "header",
                        name: "x-mc-token",
                        required: true,
                        schema: {type: "string"},
                        description: "Minecraft authorization header for the player session."
                    }, {
                        in: "query",
                        name: "includeReceipt",
                        required: false,
                        schema: {type: "boolean", default: false},
                        description: "If true, include purchase receipts for each entitlement."
                    }],
                    responses: {
                        200: {description: "List of entitlements owned by the player."}
                    }
                }
            }, "/purchase/quote": {
                post: {
                    tags: ["Purchase"],
                    summary: "Quote an offer",
                    description: "Resolves the price and optional metadata for an offer before executing a purchase. A Minecraft token or PlayFab session must be provided via headers.",
                    parameters: [{
                        in: "header",
                        name: "x-mc-token",
                        required: false,
                        schema: {type: "string"},
                        description: "Minecraft authorization header for the player session."
                    }, {
                        in: "header",
                        name: "x-playfab-session",
                        required: false,
                        schema: {type: "string"},
                        description: "PlayFab SessionTicket; used to mint a Minecraft token if one is not provided."
                    }],
                    requestBody: {
                        required: true, content: {
                            "application/json": {
                                schema: {
                                    type: "object", required: ["offerId", "price"], properties: {
                                        offerId: {
                                            type: "string", description: "Identifier of the offer to quote."
                                        }, price: {
                                            type: "integer", description: "Price in Minecoins to use for the quote."
                                        }, details: {
                                            type: "object",
                                            description: "Optional client-supplied metadata to echo back in the quote."
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: {description: "Quote payload including the resolved price and optional details."}
                    }
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
                        description: "Minecraft authorization header for the player session."
                    }, {
                        in: "header",
                        name: "x-playfab-session",
                        required: false,
                        schema: {type: "string"},
                        description: "PlayFab SessionTicket; used to mint a Minecraft token if one is not provided."
                    }],
                    requestBody: {
                        required: true, content: {
                            "application/json": {
                                schema: {
                                    type: "object", required: ["offerId", "price"], properties: {
                                        offerId: {
                                            type: "string", description: "Identifier of the offer to purchase."
                                        }, price: {
                                            type: "integer", description: "Price in Minecoins that will be debited."
                                        }, xuid: {
                                            type: "string",
                                            description: "Optional Xbox user ID to associate with the transaction."
                                        }, includePostState: {
                                            type: "boolean",
                                            default: true,
                                            description: "If true, the response also includes updated balances and inventory."
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: {
                            description: "Purchase result including transaction identifiers and, optionally, post-purchase balances and inventory."
                        }
                    }
                }
            }, "/purchase/virtual/bulk": {
                post: {
                    tags: ["Purchase"],
                    summary: "Execute multiple virtual currency purchases",
                    description: "Executes multiple Minecoin purchases for the given offers in a single batch using the active Minecraft session. Purchases are processed with limited parallelism to remain friendly to upstream rate limits.",
                    parameters: [{
                        in: "header",
                        name: "x-mc-token",
                        required: false,
                        schema: {type: "string"},
                        description: "Minecraft authorization header for the player session."
                    }, {
                        in: "header",
                        name: "x-playfab-session",
                        required: false,
                        schema: {type: "string"},
                        description: "PlayFab SessionTicket; used to mint a Minecraft token if one is not provided."
                    }],
                    requestBody: {
                        required: true, content: {
                            "application/json": {
                                schema: {
                                    type: "object", required: ["items"], properties: {
                                        items: {
                                            type: "array",
                                            description: "List of offers to purchase in the batch.",
                                            items: {
                                                type: "object", required: ["offerId", "price"], properties: {
                                                    offerId: {
                                                        type: "string",
                                                        description: "Identifier of the offer to purchase."
                                                    }, price: {
                                                        type: "integer",
                                                        description: "Price in Minecoins that will be debited for this item."
                                                    }, xuid: {
                                                        type: "string",
                                                        description: "Optional Xbox user ID for this specific transaction."
                                                    }, correlationId: {
                                                        type: "string",
                                                        description: "Optional correlation identifier for this item."
                                                    }, deviceSessionId: {
                                                        type: "string",
                                                        description: "Optional device session identifier for this item."
                                                    }, seq: {
                                                        type: "integer",
                                                        description: "Optional sequence number for this item."
                                                    }, buildPlat: {
                                                        type: "integer",
                                                        description: "Optional build platform override for this item."
                                                    }, clientIdPurchase: {
                                                        type: "string",
                                                        description: "Optional client identifier override for this item."
                                                    }, editionType: {
                                                        type: "string",
                                                        description: "Optional edition type override for this item."
                                                    }
                                                }
                                            }
                                        }, xuid: {
                                            type: "string",
                                            description: "Optional default Xbox user ID applied to all items that do not override it."
                                        }, correlationId: {
                                            type: "string",
                                            description: "Optional default correlation identifier applied to all items that do not override it."
                                        }, deviceSessionId: {
                                            type: "string",
                                            description: "Optional default device session identifier applied to all items that do not override it."
                                        }, seq: {
                                            type: "integer",
                                            description: "Optional default sequence number applied to all items that do not override it."
                                        }, buildPlat: {
                                            type: "integer",
                                            description: "Optional default build platform applied to all items that do not override it."
                                        }, clientIdPurchase: {
                                            type: "string",
                                            description: "Optional default client identifier applied to all items that do not override it."
                                        }, editionType: {
                                            type: "string",
                                            description: "Optional default edition type applied to all items that do not override it."
                                        }, includePostState: {
                                            type: "boolean",
                                            default: true,
                                            description: "If true and at least one item succeeds, the response also includes updated balances and inventory."
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: {
                            description: "Batch purchase result including per-item status and, optionally, post-purchase balances and inventory."
                        }
                    }
                }
            }, "/purchase/marketplace/creators": {
                get: {
                    tags: ["Purchase"],
                    summary: "List creators via purchase flow",
                    description: "Retrieves the list of creators using either a Minecraft token or a PlayFab session, which is upgraded to a Minecraft token when necessary.",
                    parameters: [{
                        in: "header",
                        name: "x-mc-token",
                        required: false,
                        schema: {type: "string"},
                        description: "Minecraft authorization header for the player session."
                    }, {
                        in: "header",
                        name: "x-playfab-session",
                        required: false,
                        schema: {type: "string"},
                        description: "PlayFab SessionTicket; used to mint a Minecraft token if one is not provided."
                    }],
                    responses: {
                        200: {
                            description: "Dictionary of creators keyed by display name, including the total count."
                        }
                    }
                }
            }, "/purchase/inventory/balances": {
                get: {
                    tags: ["Purchase"],
                    summary: "Get balances via purchase flow",
                    description: "Returns the player's virtual currency balances using either a Minecraft token or a PlayFab session, which is upgraded to a Minecraft token when necessary.",
                    parameters: [{
                        in: "header",
                        name: "x-mc-token",
                        required: false,
                        schema: {type: "string"},
                        description: "Minecraft authorization header for the player session."
                    }, {
                        in: "header",
                        name: "x-playfab-session",
                        required: false,
                        schema: {type: "string"},
                        description: "PlayFab SessionTicket; used to mint a Minecraft token if one is not provided."
                    }],
                    responses: {
                        200: {description: "Balance payload including currency types and amounts."}
                    }
                }
            }, "/purchase/inventory/entitlements": {
                get: {
                    tags: ["Purchase"],
                    summary: "Get entitlements via purchase flow",
                    description: "Retrieves the player's inventory entitlements using either a Minecraft token or a PlayFab session, which is upgraded to a Minecraft token when necessary.",
                    parameters: [{
                        in: "header",
                        name: "x-mc-token",
                        required: false,
                        schema: {type: "string"},
                        description: "Minecraft authorization header for the player session."
                    }, {
                        in: "header",
                        name: "x-playfab-session",
                        required: false,
                        schema: {type: "string"},
                        description: "PlayFab SessionTicket; used to mint a Minecraft token if one is not provided."
                    }, {
                        in: "query",
                        name: "includeReceipt",
                        required: false,
                        schema: {type: "boolean", default: false},
                        description: "If true, include purchase receipts for each entitlement."
                    }],
                    responses: {
                        200: {description: "List of entitlements owned by the player."}
                    }
                }
            }, "/debug/decode-token": {
                post: {
                    tags: ["Debug"],
                    summary: "Decode token",
                    description: "Accepts a single token or a map of tokens and returns decoded headers, payloads, token kind, and expiration metadata when available.",
                    requestBody: {
                        required: true, content: {
                            "application/json": {
                                schema: {
                                    oneOf: [{
                                        type: "object", required: ["token"], properties: {
                                            token: {type: "string", description: "Token to decode."}
                                        }
                                    }, {
                                        type: "object", required: ["tokens"], properties: {
                                            tokens: {
                                                type: "object",
                                                additionalProperties: {type: "string"},
                                                description: "Object whose values are tokens to decode."
                                            }
                                        }
                                    }]
                                }
                            }
                        }
                    },
                    responses: {
                        200: {description: "Decoded representation of the supplied token or tokens."}
                    }
                }
            }
        }
    }, apis: []
};

export const swaggerSpec = swaggerJSDoc(options);
