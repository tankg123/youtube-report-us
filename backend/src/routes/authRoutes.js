const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const {
  authMiddleware,
  allowRoles
} = require("../middlewares/authMiddleware");

router.post("/register", authController.register);
router.post("/login", authController.login);

router.get("/me", authMiddleware, authController.me);
router.put("/profile", authMiddleware, authController.updateProfile);
router.put("/change-password", authMiddleware, authController.changePassword);

router.get(
  "/users",
  authMiddleware,
  allowRoles("admin"),
  authController.getAllUsers
);

router.put(
  "/users/:id/role",
  authMiddleware,
  allowRoles("admin"),
  authController.updateUserRole
);

router.put(
  "/users/:id/status",
  authMiddleware,
  allowRoles("admin"),
  authController.updateUserStatus
);

router.delete(
  "/users/:id",
  authMiddleware,
  allowRoles("admin"),
  authController.deleteUser
);

module.exports = router;
