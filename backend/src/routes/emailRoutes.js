const express = require("express");
const router = express.Router();
const emailController = require("../controllers/emailController");
const { authMiddleware, allowRoles } = require("../middlewares/authMiddleware");

const EMAIL_ROLES = ["admin", "Report Manager"];

router.use(authMiddleware);

router.get("/notification", allowRoles(...EMAIL_ROLES), emailController.getNotification);
router.put("/notification", allowRoles(...EMAIL_ROLES), emailController.updateNotificationSettings);
router.post("/notification/send", allowRoles(...EMAIL_ROLES), emailController.sendNotification);
router.post("/notification/schedules", allowRoles(...EMAIL_ROLES), emailController.createNotificationSchedule);
router.delete("/notification/schedules/:id", allowRoles(...EMAIL_ROLES), emailController.deleteNotificationSchedule);

module.exports = router;
