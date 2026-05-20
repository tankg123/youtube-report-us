const express = require("express");
const router = express.Router();

const channelController = require("../controllers/channelController");

const {
  authMiddleware,
  allowRoles
} = require("../middlewares/authMiddleware");

const REPORT_ROLES = ["admin", "Report Manager"];
const CHANNEL_MANAGEMENT_ROLES = ["admin", "Channel Management"];

router.get(
  "/management",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.getManagedChannels
);

router.post(
  "/management/preview",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.previewChannelsBulk
);

router.post(
  "/management/export",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.exportManagedChannels
);

router.post(
  "/management/bulk",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.addChannelsBulk
);

router.put(
  "/management/bulk",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.bulkUpdateManagedChannels
);

router.post(
  "/management/bulk-delete",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.bulkDeleteManagedChannels
);

router.post(
  "/management/sync-basic",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.syncManagedChannelsBasic
);

router.put(
  "/management/:id",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.updateManagedChannel
);

router.delete(
  "/management/:id",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.deleteManagedChannel
);

router.get(
  "/",
  authMiddleware,
  allowRoles(...REPORT_ROLES),
  channelController.getAllChannels
);

router.get(
  "/stats",
  authMiddleware,
  allowRoles(...REPORT_ROLES),
  channelController.getStats
);

router.get(
  "/:id/detail",
  authMiddleware,
  allowRoles(...REPORT_ROLES),
  channelController.getChannelDetail
);

router.get(
  "/collaborators",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.listCollaborators
);

router.post(
  "/collaborators",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.createCollaborator
);

router.put(
  "/collaborators/:id",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.updateCollaborator
);

router.delete(
  "/collaborators/:id",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.deleteCollaborator
);

router.get(
  "/revenue-sharings",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.listRevenueSharings
);

router.post(
  "/revenue-sharings",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.createRevenueSharing
);

router.put(
  "/revenue-sharings/:id",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.updateRevenueSharing
);

router.delete(
  "/revenue-sharings/:id",
  authMiddleware,
  allowRoles(...CHANNEL_MANAGEMENT_ROLES),
  channelController.deleteRevenueSharing
);

router.post(
  "/sync-all",
  authMiddleware,
  allowRoles(...REPORT_ROLES),
  channelController.syncAllChannels
);

router.post(
  "/sync-basic",
  authMiddleware,
  allowRoles(...REPORT_ROLES),
  channelController.syncAllChannelsBasic
);

router.post(
  "/:id/network",
  authMiddleware,
  allowRoles(...REPORT_ROLES),
  channelController.changeChannelNetwork
);

router.post(
  "/",
  authMiddleware,
  allowRoles(...REPORT_ROLES),
  channelController.addChannel
);

router.put(
  "/:id/refresh",
  authMiddleware,
  allowRoles(...REPORT_ROLES),
  channelController.refreshChannel
);

router.delete(
  "/:id",
  authMiddleware,
  allowRoles(...REPORT_ROLES),
  channelController.deleteChannel
);

module.exports = router;
