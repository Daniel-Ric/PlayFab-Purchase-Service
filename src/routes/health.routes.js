import express from "express";

const router = express.Router();

router.get("/", (_req, res) => res.json({
    name: "xlink-purchase-addon",
    status: "ok",
    endpoints: {
        health: "/healthz",
        readiness: "/readyz",
        docs: "/api-docs",
        openapi: "/openapi.json"
    },
    auth: "Business routes require Authorization: Bearer <jwt>."
}));

router.get("/healthz", (_req, res) => res.json({ok: true}));
router.get("/readyz", (_req, res) => res.json({ready: true}));
router.get("/favicon.ico", (_req, res) => res.status(204).end());
router.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send("User-agent: *\nDisallow:\n");
});
router.get("/sitemap.xml", (_req, res) => {
    res.type("application/xml").send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
});

export default router;
