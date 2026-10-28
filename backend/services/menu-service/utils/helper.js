// Case-insensitive name comparison used for the unique names of categories, ingredients and discounts.
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

module.exports = { sameName };
