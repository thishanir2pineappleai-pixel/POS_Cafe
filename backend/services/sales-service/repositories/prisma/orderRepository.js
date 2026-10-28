// MySQL (Prisma) order repository: the same methods and the same row shapes as the in-memory one
// (repositories/memory/orderRepository.js). Money comes back as plain numbers with 2 decimals, order times as the stored
// wall-clock text 'YYYY-MM-DDTHH:mm:ss' (the column keeps the business-local time as is, no zone conversion), other dates as
// ISO strings, so API responses are identical to memory mode. Every query is limited to ONE account.
const crypto = require('node:crypto');
const { prisma } = require('./client');
const { dateOf, inDateRange, timeLabel } = require('@pos-cafe/shared/date');
const { formatItemsText } = require('../../utils/formatter');
const { toCents, toDecimalString } = require('../../utils/money');

const num = (v) => Number(v);
const money = (value) => toDecimalString(toCents(value)); // a Decimal column takes the exact text, never a float
const wall = (text) => new Date(`${text}Z`); // 'YYYY-MM-DDTHH:mm:ss' kept as written (the driver treats DateTime as UTC)
const wallText = (date) => date.toISOString().slice(0, 19);

const INCLUDE = { items: { orderBy: { position: 'asc' } }, payment: true };

function toRow(o) {
  return {
    id: o.id,
    accountId: o.accountId,
    shopId: o.shopId,
    orderNumber: o.orderNumber,
    type: o.type,
    status: o.status,
    customerId: o.customerId,
    customerName: o.customerName,
    tableLabel: o.tableLabel,
    subtotal: num(o.subtotal),
    discountTotal: num(o.discountTotal),
    total: num(o.total),
    placedAt: wallText(o.placedAt),
    items: o.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      unitPrice: num(i.unitPrice),
      quantity: i.quantity,
      discountPercentage: num(i.discountPercentage),
      discountAmount: num(i.discountAmount),
      discountApplicationId: i.discountApplicationId,
    })),
    payment: o.payment ? {
      method: o.payment.method,
      amount: num(o.payment.amount),
      paidAt: wallText(o.payment.paidAt),
      recordedBy: o.payment.recordedBy,
    } : null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

const itemRows = (items) => items.map((i, position) => ({
  productId: i.productId ?? null,
  name: i.name,
  unitPrice: money(i.unitPrice),
  quantity: i.quantity,
  position,
  discountPercentage: money(i.discountPercentage ?? 0),
  discountAmount: money(i.discountAmount ?? 0),
  discountApplicationId: i.discountApplicationId ?? null,
}));

function whereOf({ accountId, shopId, from, to }) {
  const where = { accountId };
  if (shopId !== undefined && shopId !== null) where.shopId = shopId;
  if (from || to) {
    where.placedAt = {};
    if (from) where.placedAt.gte = wall(`${from}T00:00:00`);
    if (to) where.placedAt.lte = wall(`${to}T23:59:59`);
  }
  return where;
}

const ORDER_BY = [{ placedAt: 'desc' }, { id: 'desc' }];
const searchableText = (o) => [o.orderNumber, o.type, o.customerName, formatItemsText(o.items), o.status, timeLabel(o.placedAt)];
const matchesSearch = (needle) => (o) => searchableText(o).some((text) => text && text.toLowerCase().includes(needle));

module.exports = {
  // The order, its lines and its number #ORD<id> are saved together or not at all.
  async create(data) {
    return prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          accountId: data.accountId,
          shopId: data.shopId,
          orderNumber: `tmp-${crypto.randomBytes(12).toString('hex')}`, // 28 characters (the column holds 30); replaced below, once the id is known
          type: data.type,
          status: data.status,
          customerName: data.customerName ?? null,
          tableLabel: data.tableLabel ?? null,
          subtotal: money(data.subtotal),
          discountTotal: money(data.discountTotal),
          total: money(data.total),
          placedAt: wall(data.placedAt),
          items: { create: itemRows(data.items) },
        },
      });
      return toRow(await tx.order.update({ where: { id: created.id }, data: { orderNumber: `#ORD${created.id}` }, include: INCLUDE }));
    });
  },

  async findById(id, { accountId }) {
    const order = await prisma.order.findFirst({ where: { id, accountId }, include: INCLUDE });
    return order ? toRow(order) : null;
  },

  // Replaces type, customer, table, the money columns and ALL lines in one transaction; null when not found in this account or,
  // when `status` is given, when the order no longer has that status. The guarded UPDATE both checks the status and locks the row,
  // so a barista step or a payment that arrives at the same moment waits for the edit instead of racing it.
  async update(id, { accountId, status }, data) {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id, accountId, ...(status ? { status } : {}) },
        data: {
          type: data.type,
          customerName: data.customerName ?? null,
          tableLabel: data.tableLabel ?? null,
          subtotal: money(data.subtotal),
          discountTotal: money(data.discountTotal),
          total: money(data.total),
        },
      });
      if (count === 0) return null;
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      await tx.orderItem.createMany({ data: itemRows(data.items).map((line) => ({ ...line, orderId: id })) });
      return toRow(await tx.order.findUnique({ where: { id }, include: INCLUDE }));
    });
  },

  // Moves the order from one status to another only if it still has the `from` status (one guarded UPDATE, so two requests
  // cannot both win); null when the order does not exist in this account or its status is no longer `from`.
  async transition(id, { accountId }, { from, to }) {
    const { count } = await prisma.order.updateMany({ where: { id, accountId, status: from }, data: { status: to } });
    if (count === 0) return null;
    return toRow(await prisma.order.findUnique({ where: { id }, include: INCLUDE }));
  },

  // The guarded status update and the payment row are saved together or not at all (one transaction); null when the order is
  // not in this account or no longer has the `from` status. payment: { method, amount, paidAt, recordedBy }
  async pay(id, { accountId }, { from, to, payment }) {
    return prisma.$transaction(async (tx) => {
      if (await tx.payment.findUnique({ where: { orderId: id }, select: { id: true } })) return null; // one payment per order
      const { count } = await tx.order.updateMany({ where: { id, accountId, status: from }, data: { status: to } });
      if (count === 0) return null;
      await tx.payment.create({ data: { orderId: id, accountId, method: payment.method, amount: money(payment.amount), paidAt: wall(payment.paidAt), recordedBy: payment.recordedBy } });
      return toRow(await tx.order.findUnique({ where: { id }, include: INCLUDE }));
    }).catch((err) => {
      if (err.code === 'P2002') return null; // a concurrent payment won the unique key on payments.orderId; this transaction was rolled back
      throw err;
    });
  },

  // ponytail: with a text search the matching runs in JS over the account's orders in the date range (the search covers the
  // computed time text and the item text); without a search the paging runs in SQL. Fine at cafe scale; for hundreds of
  // thousands of orders move the search into SQL.
  async list({ offset, limit, ...filters }) {
    const where = whereOf(filters);
    if (!filters.search) {
      const [total, rows] = await Promise.all([prisma.order.count({ where }), prisma.order.findMany({ where, include: INCLUDE, orderBy: ORDER_BY, skip: offset, take: limit })]);
      return { total, rows: rows.map(toRow) };
    }
    const all = (await prisma.order.findMany({ where, include: INCLUDE, orderBy: ORDER_BY })).map(toRow).filter(matchesSearch(filters.search.toLowerCase()));
    return { total: all.length, rows: all.slice(offset, offset + limit) };
  },

  async findAll(filters) {
    const rows = (await prisma.order.findMany({ where: whereOf(filters), include: INCLUDE, orderBy: ORDER_BY })).map(toRow);
    return filters.search ? rows.filter(matchesSearch(filters.search.toLowerCase())) : rows;
  },

  async recent({ accountId, shopId, limit }) {
    return (await prisma.order.findMany({ where: whereOf({ accountId, shopId }), include: INCLUDE, orderBy: ORDER_BY, take: limit })).map(toRow);
  },

  // PENDING APPROVAL: a "new customer" is a customerId whose very first order (any status) falls inside the range.
  // No API sets customerId yet (there is no Customer data), so this is 0 today.
  async countNewCustomers({ accountId, shopId, from, to }) {
    const where = { ...whereOf({ accountId, shopId }), customerId: { not: null } };
    const firsts = await prisma.order.groupBy({ by: ['customerId'], where, _min: { placedAt: true } });
    return firsts.filter((f) => inDateRange(dateOf(wallText(f._min.placedAt)), { from, to })).length;
  },
};
