// Display codes shown in the Figma (#PRD111, #ING111).
// PENDING APPROVAL: numbering. Codes are built from the numeric id, which starts at 1 here.
const formatProductCode = (id) => `#PRD${id}`;
const formatIngredientCode = (id) => `#ING${id}`;

module.exports = { formatProductCode, formatIngredientCode };
