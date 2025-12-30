const express = require('express');
const router = express.Router();

const userController = require("../controllers/userController");
const validateMiddleware = require('../utils/validate');
const { authenticate } = require('../middleware/authMiddleware');
const userUpdateSchema = require('../validations/userUpdateValidation');
const userSchema = require('../validations/userValidation');

router.get('/',authenticate, userController.getAllUsers);
router.post('/',authenticate,validateMiddleware(userSchema), userController.createUser);
router.get('/:id',authenticate, userController.getUserById);
router.put('/:id',authenticate,validateMiddleware(userUpdateSchema), userController.updateUser);
router.delete('/:id',authenticate, userController.deleteUser);

module.exports = router