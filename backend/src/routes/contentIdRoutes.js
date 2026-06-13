const express = require("express");
const {
  addCodes,
  addWhitelistChannels,
  createClaim,
  createArtist,
  createLabel,
  deleteCode,
  deleteClaimHistory,
  deleteArtist,
  deleteLabel,
  deleteProduct,
  deleteWhitelistChannels,
  getAvailableCodes,
  getCodeSummary,
  getProduct,
  listClaims,
  listArtists,
  listCodes,
  listCmsNetworks,
  listLabels,
  listProducts,
  listWhitelists,
  releaseClaims,
  saveProduct,
  searchClaims,
  syncClaim,
  syncLabelsFromCms,
  syncWhitelistChannelInfo,
  syncWhitelists,
  updateArtist,
  updateLabel,
  updateCode
} = require("../controllers/contentIdController");
const { releaseVideoClaims, searchVideoClaims } = require("../controllers/claimController");
const { authMiddleware, allowRoles } = require("../middlewares/authMiddleware");

const router = express.Router();
const CONTENT_ID_ROLES = ["admin", "Content ID"];
const CLAIM_MANAGER_ROLES = ["admin", "Content ID", "Claim Manager"];
const LABEL_READ_ROLES = ["admin", "Content ID", "Claim Manager", "Account", "Account Claim Manager"];
const LABEL_WRITE_ROLES = ["admin", "Content ID"];

router.use(authMiddleware);

router.get("/codes/summary", allowRoles(...CONTENT_ID_ROLES), getCodeSummary);
router.get("/codes/available", allowRoles(...CONTENT_ID_ROLES), getAvailableCodes);
router.get("/codes", allowRoles(...CONTENT_ID_ROLES), listCodes);
router.post("/codes", allowRoles(...CONTENT_ID_ROLES), addCodes);
router.put("/codes/:id", allowRoles(...CONTENT_ID_ROLES), updateCode);
router.delete("/codes/:id", allowRoles(...CONTENT_ID_ROLES), deleteCode);

router.get("/cms-networks", allowRoles(...CLAIM_MANAGER_ROLES), listCmsNetworks);
router.get("/claims", allowRoles(...CONTENT_ID_ROLES), listClaims);
router.post("/claims/search", allowRoles(...CLAIM_MANAGER_ROLES), searchVideoClaims);
router.post("/claims/release", allowRoles(...CLAIM_MANAGER_ROLES), releaseVideoClaims);
router.post("/claims", allowRoles(...CONTENT_ID_ROLES), createClaim);
router.post("/claims/:id/sync", allowRoles(...CONTENT_ID_ROLES), syncClaim);
router.delete("/claims/:id", allowRoles(...CONTENT_ID_ROLES), deleteClaimHistory);

router.get("/labels", allowRoles(...LABEL_READ_ROLES), listLabels);
router.post("/labels", allowRoles(...LABEL_WRITE_ROLES), createLabel);
router.post("/labels/sync-cms", allowRoles(...LABEL_WRITE_ROLES), syncLabelsFromCms);
router.put("/labels/:id", allowRoles(...LABEL_WRITE_ROLES), updateLabel);
router.delete("/labels/:id", allowRoles(...LABEL_WRITE_ROLES), deleteLabel);

router.get("/whitelists", allowRoles(...CONTENT_ID_ROLES), listWhitelists);
router.post("/whitelists/sync-cms", allowRoles(...CONTENT_ID_ROLES), syncWhitelists);
router.post("/whitelists/sync-channel-info", allowRoles(...CONTENT_ID_ROLES), syncWhitelistChannelInfo);
router.post("/whitelists", allowRoles(...CONTENT_ID_ROLES), addWhitelistChannels);
router.delete("/whitelists", allowRoles(...CONTENT_ID_ROLES), deleteWhitelistChannels);

router.get("/artists", allowRoles(...CONTENT_ID_ROLES), listArtists);
router.post("/artists", allowRoles(...CONTENT_ID_ROLES), createArtist);
router.put("/artists/:id", allowRoles(...CONTENT_ID_ROLES), updateArtist);
router.delete("/artists/:id", allowRoles(...CONTENT_ID_ROLES), deleteArtist);

router.get("/products", allowRoles(...CONTENT_ID_ROLES), listProducts);
router.post("/products", allowRoles(...CONTENT_ID_ROLES), saveProduct);
router.get("/products/:id", allowRoles(...CONTENT_ID_ROLES), getProduct);
router.delete("/products/:id", allowRoles(...CONTENT_ID_ROLES), deleteProduct);

module.exports = router;
