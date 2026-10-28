// Money is calculated in WHOLE CENTS (integers), never with floating-point amounts, and converted back to a plain number
// with at most 2 decimals only at the edge (API responses, Prisma Decimal columns).
// Rounding rule: half up (0.5 cent rounds to the next cent). PENDING APPROVAL: the business has not stated a rounding rule.

// 250.5 -> 25050. Accepts numbers and strings with at most 2 decimals (what Menu stores and the API returns).
const toCents = (amount) => Math.round(Number(amount) * 100);

// 25050 -> 250.5
const fromCents = (cents) => cents / 100;

// "123.45" for a Prisma Decimal column.
const toDecimalString = (cents) => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;

// percentage has at most 2 decimals (Menu stores 0-100 with Decimal(5,2)), so it is used as hundredths of a percent.
// cents x percentage / 100, rounded half up, all in integers.
function percentOf(cents, percentage) {
  const hundredths = Math.round(Number(percentage) * 100);
  return Math.round((cents * hundredths) / 10000);
}

module.exports = { toCents, fromCents, toDecimalString, percentOf };
