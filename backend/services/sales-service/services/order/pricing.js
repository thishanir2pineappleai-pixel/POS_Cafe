// Prices an order. Pure and synchronous: the callers fetch the products (Menu Service) and the discount applications first.
//
// Rules (what is CONFIRMED and what is not):
//   * Unit price = the product's Menu selling price at the moment the order is saved; the line keeps a COPY of name and price.
//   * Line = quantity x unit price. Subtotal = sum of lines. No tax and no service charge: no rate exists in the requirements.
//   * CONFIRMED (BRD BR-09): daily offers are applied automatically to eligible items and the final amount is shown.
//     An application is eligible for a line when it is Active, its period includes the order date, and it applies to all
//     products or lists the product (the caller passes only such applications).
//   * PENDING APPROVAL: when several applications are eligible for one line the LARGEST percentage is used, they are NOT stacked
//     (stacking and priority were never approved). The product's own Menu discount is NOT applied here (also not approved).
//   * PENDING APPROVAL: the discount is rounded half up to the cent per line.
//   * All money is calculated in whole cents (utils/money.js); no floating-point amounts are added.
const { toCents, fromCents, percentOf } = require('../../utils/money');

// lines: [{ productId, quantity }]; productsById: Map id -> { name, sellingPrice }; applications: eligible applications.
function priceOrder(lines, productsById, applications) {
  let subtotal = 0;
  let discountTotal = 0;
  const items = lines.map((line) => {
    const product = productsById.get(line.productId);
    const unitCents = toCents(product.sellingPrice);
    const lineCents = unitCents * line.quantity;
    const eligible = applications.filter((a) => a.appliesToAll || a.productIds.includes(line.productId));
    const best = eligible.reduce((top, a) => (!top || a.discountPercentage > top.discountPercentage ? a : top), null); // first (lowest id) wins a tie
    const discountCents = best ? percentOf(lineCents, best.discountPercentage) : 0;
    subtotal += lineCents;
    discountTotal += discountCents;
    return {
      productId: line.productId,
      name: product.name,
      unitPrice: fromCents(unitCents),
      quantity: line.quantity,
      discountPercentage: best ? best.discountPercentage : 0,
      discountAmount: fromCents(discountCents),
      discountApplicationId: best ? best.id : null,
    };
  });
  return {
    items,
    subtotalCents: subtotal,
    totalCents: subtotal - discountTotal,
    subtotal: fromCents(subtotal),
    discountTotal: fromCents(discountTotal),
    total: fromCents(subtotal - discountTotal),
  };
}

module.exports = { priceOrder };
