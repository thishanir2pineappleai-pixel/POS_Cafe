const { Router } = require('express');
const { idParam } = require('@pos-cafe/shared/validate');
const { createImageUpload } = require('@pos-cafe/shared/uploads');
const menuController = require('../../controllers/menu/menuController');
const imageController = require('../../controllers/menu/imageController');
const categoryController = require('../../controllers/menu/categoryController');
const ingredientController = require('../../controllers/menu/ingredientController');
const discountController = require('../../controllers/menu/discountController');
const {
  validateProductBody, validateProductQuery, validateIngredientQuantityBody, validateCategoryBody,
} = require('../../middleware/validation/munuValidation');
const { validateIngredientBody, validateIngredientQuery } = require('../../middleware/validation/ingredientValidation');
const { validateDiscountBody } = require('../../middleware/validation/discountValidation');

const { uploadImage, requireImage } = createImageUpload();
const router = Router();

// Products
router.get('/products', validateProductQuery, menuController.list);
router.get('/products/summary', menuController.summary); // must stay above '/products/:id'
router.get('/products/:id', idParam('id'), menuController.get);
router.post('/products', validateProductBody, menuController.create);
router.put('/products/:id', idParam('id'), validateProductBody, menuController.update);
router.delete('/products/:id', idParam('id'), menuController.remove);
router.patch('/products/:id/ingredients/:ingredientId', idParam('id'), idParam('ingredientId'), validateIngredientQuantityBody, menuController.updateIngredient);
router.post('/products/:id/image', idParam('id'), uploadImage, requireImage, imageController.upload);

// Categories
router.get('/categories', categoryController.list);
router.post('/categories', validateCategoryBody, categoryController.create);

// Ingredients (autocomplete and create)
router.get('/ingredients', validateIngredientQuery, ingredientController.search);
router.post('/ingredients', validateIngredientBody, ingredientController.create);

// Discount definitions (name and percentage). Discount applications belong to the Sales Service.
router.get('/discounts', discountController.list);
router.post('/discounts', validateDiscountBody, discountController.create);

module.exports = router;
