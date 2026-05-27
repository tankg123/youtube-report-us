const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");

router.get("/partner-requests/:token", reportController.getPublicPartnerRequest);
router.post("/partner-requests/:token", reportController.submitPublicPartnerRequest);

module.exports = router;
