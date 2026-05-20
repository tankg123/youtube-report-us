const express = require("express");
const router = express.Router();

const settingsController = require("../controllers/settingsController");
const { authMiddleware, allowRoles } = require("../middlewares/authMiddleware");

router.get("/system", settingsController.getSettings);
router.put("/system", authMiddleware, allowRoles("admin"), settingsController.updateSettings);

module.exports = router;
