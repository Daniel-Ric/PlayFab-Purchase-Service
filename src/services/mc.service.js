import {
    getBalances as _getBalances,
    getInventory as _getInventory,
    getMCTokenFromSession
} from "./minecraft.service.js";

export function getMCToken(sessionTicket) {
    return getMCTokenFromSession(sessionTicket);
}

export const getBalances = _getBalances;
export const getInventory = _getInventory;
