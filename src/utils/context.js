import {AsyncLocalStorage} from "node:async_hooks";

const storage = new AsyncLocalStorage();

export function runWithRequestContext(context, fn) {
    return storage.run(context, fn);
}

export function getRequestContext() {
    return storage.getStore() || {};
}
