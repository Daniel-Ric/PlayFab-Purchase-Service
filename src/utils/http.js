import axios from "axios";
import http from "node:http";
import https from "node:https";
import {getRequestContext} from "./context.js";

const httpAgent = new http.Agent({keepAlive: true, maxSockets: 100});
const httpsAgent = new https.Agent({keepAlive: true, maxSockets: 100});

export function createHttp(timeoutMs = 15000) {
    const instance = axios.create({
        timeout: Number(timeoutMs) || 15000,
        httpAgent,
        httpsAgent,
        validateStatus: s => s >= 200 && s < 300,
        maxRedirects: 5
    });

    instance.interceptors.request.use(config => {
        const context = getRequestContext();
        if (context && context.requestId) {
            const headers = config.headers || {};
            if (!headers["x-correlation-id"] && !headers["X-Correlation-Id"]) {
                headers["x-correlation-id"] = context.requestId;
            }
            config.headers = headers;
        }
        return config;
    });

    return instance;
}
