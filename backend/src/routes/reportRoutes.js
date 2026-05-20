const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const { authMiddleware, allowRoles } = require("../middlewares/authMiddleware");

const REPORT_ROLES = ["admin", "Report Manager"];
const PARTNER_ROLES = ["admin", "Report Manager", "Channel Management"];
const NETWORK_READ_ROLES = ["admin", "Report Manager", "Channel Management"];

router.use(authMiddleware);

router.post("/manager/import", allowRoles(...REPORT_ROLES), reportController.importManagerReport);
router.get("/dashboard", allowRoles(...REPORT_ROLES), reportController.getDashboard);
router.get("/manager", allowRoles(...REPORT_ROLES), reportController.getReportSummary);
router.delete("/manager", allowRoles(...REPORT_ROLES), reportController.deleteReportMonth);
router.get("/youtube/quota", allowRoles(...REPORT_ROLES), reportController.getYoutubeQuota);

router.get("/networks", allowRoles(...NETWORK_READ_ROLES), reportController.getNetworks);
router.post("/networks", allowRoles(...REPORT_ROLES), reportController.createNetwork);
router.put("/networks/:id", allowRoles(...REPORT_ROLES), reportController.updateNetwork);
router.delete("/networks/:id", allowRoles(...REPORT_ROLES), reportController.deleteNetwork);

router.get("/exchange-rates", allowRoles(...REPORT_ROLES), reportController.getExchangeRates);
router.post("/exchange-rates", allowRoles(...REPORT_ROLES), reportController.createExchangeRate);
router.put("/exchange-rates/:id", allowRoles(...REPORT_ROLES), reportController.updateExchangeRate);
router.delete("/exchange-rates/:id", allowRoles(...REPORT_ROLES), reportController.deleteExchangeRate);

router.get("/companies", allowRoles(...REPORT_ROLES), reportController.getCompanies);
router.post("/companies", allowRoles(...REPORT_ROLES), reportController.createCompany);
router.put("/companies/:id", allowRoles(...REPORT_ROLES), reportController.updateCompany);
router.delete("/companies/:id", allowRoles(...REPORT_ROLES), reportController.deleteCompany);

router.get("/partners", allowRoles(...PARTNER_ROLES), reportController.getPartners);
router.post("/partners", allowRoles(...PARTNER_ROLES), reportController.createPartner);
router.put("/partners/:id", allowRoles(...PARTNER_ROLES), reportController.updatePartner);
router.delete("/partners/:id", allowRoles(...PARTNER_ROLES), reportController.deletePartner);

router.get("/groups", allowRoles(...REPORT_ROLES), reportController.getGroups);
router.post("/groups", allowRoles(...REPORT_ROLES), reportController.createGroup);
router.put("/groups/:id", allowRoles(...REPORT_ROLES), reportController.updateGroup);
router.delete("/groups/:id", allowRoles(...REPORT_ROLES), reportController.deleteGroup);
router.get("/groups/:id", allowRoles(...REPORT_ROLES), reportController.getGroupDetail);
router.post("/groups/:id/export/excel", allowRoles(...REPORT_ROLES), reportController.exportGroupExcel);
router.post("/groups/:id/export/pdf", allowRoles(...REPORT_ROLES), reportController.exportGroupPdf);
router.post("/groups/:id/channels", allowRoles(...REPORT_ROLES), reportController.addGroupChannels);
router.delete("/groups/:id/channels/:channelId", allowRoles(...REPORT_ROLES), reportController.removeGroupChannel);

module.exports = router;
