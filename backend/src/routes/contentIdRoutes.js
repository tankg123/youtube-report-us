const express = require("express");
const {
  addCodes,
  createArtist,
  createLabel,
  deleteCode,
  deleteArtist,
  deleteLabel,
  deleteProduct,
  getAvailableCodes,
  getCodeSummary,
  getProduct,
  listArtists,
  listCodes,
  listLabels,
  listProducts,
  saveProduct,
  updateArtist,
  updateLabel,
  updateCode
} = require("../controllers/contentIdController");
const { authMiddleware, allowRoles } = require("../middlewares/authMiddleware");

const router = express.Router();
const CONTENT_ID_ROLES = ["admin", "Content ID"];

router.use(authMiddleware);

router.get("/codes/summary", allowRoles(...CONTENT_ID_ROLES), getCodeSummary);
router.get("/codes/available", allowRoles(...CONTENT_ID_ROLES), getAvailableCodes);
router.get("/codes", allowRoles(...CONTENT_ID_ROLES), listCodes);
router.post("/codes", allowRoles(...CONTENT_ID_ROLES), addCodes);
router.put("/codes/:id", allowRoles(...CONTENT_ID_ROLES), updateCode);
router.delete("/codes/:id", allowRoles(...CONTENT_ID_ROLES), deleteCode);

router.get("/labels", allowRoles(...CONTENT_ID_ROLES), listLabels);
router.post("/labels", allowRoles(...CONTENT_ID_ROLES), createLabel);
router.put("/labels/:id", allowRoles(...CONTENT_ID_ROLES), updateLabel);
router.delete("/labels/:id", allowRoles(...CONTENT_ID_ROLES), deleteLabel);

router.get("/artists", allowRoles(...CONTENT_ID_ROLES), listArtists);
router.post("/artists", allowRoles(...CONTENT_ID_ROLES), createArtist);
router.put("/artists/:id", allowRoles(...CONTENT_ID_ROLES), updateArtist);
router.delete("/artists/:id", allowRoles(...CONTENT_ID_ROLES), deleteArtist);

router.get("/products", allowRoles(...CONTENT_ID_ROLES), listProducts);
router.post("/products", allowRoles(...CONTENT_ID_ROLES), saveProduct);
router.get("/products/:id", allowRoles(...CONTENT_ID_ROLES), getProduct);
router.delete("/products/:id", allowRoles(...CONTENT_ID_ROLES), deleteProduct);

module.exports = router;
