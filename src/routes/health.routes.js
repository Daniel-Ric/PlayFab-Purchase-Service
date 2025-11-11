import express from "express";

const router = express.Router();

router.get("/healthz", (_req, res) => res.json({ok: true}));
router.get("/readyz", (_req, res) => res.json({ready: true}));

export default router;
