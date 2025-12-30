const express = require('express');
const roleController = require('../controllers/roleController');
const { authenticate } = require('../middleware/authMiddleware');
const { roleSchema } = require('../validations/roleValidation');
const validateMiddleware = require('../utils/validate');

const router = express.Router();

router.post('/',authenticate,validateMiddleware(roleSchema), roleController.createRole);
router.get('/',authenticate, roleController.getRoles);
router.get('/:id',authenticate, roleController.getRoleById);
router.put('/:id',authenticate,validateMiddleware(roleSchema), roleController.updateRole);
router.delete('/:id',authenticate, roleController.deleteRole);

module.exports = router;
