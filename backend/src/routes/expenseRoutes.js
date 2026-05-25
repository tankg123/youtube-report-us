const express = require("express");
const expenseController = require("../controllers/expenseController");
const { authMiddleware, allowRoles } = require("../middlewares/authMiddleware");

const router = express.Router();
const EXPENSE_ROLES = ["admin", "Report Manager"];

router.use(authMiddleware);
router.use(allowRoles(...EXPENSE_ROLES));

router.get("/overview", expenseController.overview);

router.get("/accounts", expenseController.listAccounts);
router.post("/accounts", expenseController.createAccount);
router.put("/accounts/:id", expenseController.updateAccount);
router.delete("/accounts/:id", expenseController.deleteAccount);

router.get("/categories", expenseController.listCategories);
router.post("/categories", expenseController.createCategory);
router.put("/categories/:id", expenseController.updateCategory);
router.delete("/categories/:id", expenseController.deleteCategory);

router.get("/transactions", expenseController.listTransactions);
router.post("/transactions", expenseController.createTransaction);
router.get("/transactions/:id", expenseController.getTransaction);
router.put("/transactions/:id", expenseController.updateTransaction);
router.delete("/transactions/:id", expenseController.deleteTransaction);

router.get("/revenues", expenseController.listRevenues);
router.post("/revenues", expenseController.createRevenue);
router.put("/revenues/:id", expenseController.updateRevenue);
router.delete("/revenues/:id", expenseController.deleteRevenue);

module.exports = router;
