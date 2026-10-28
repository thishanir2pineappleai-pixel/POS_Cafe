// Menu discount DEFINITIONS only (name and percentage). No price calculation, and no link to Sales discount
// applications: how the two combine is not decided yet.
const { discountRepository } = require('../../repositories');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');

const toDto = (row) => ({ id: row.id, name: row.name, percentage: row.percentage });

const list = async () => (await discountRepository.list()).map(toDto);

async function create({ name, percentage }) {
  if (await discountRepository.findByName(name)) {
    throw new AppError(409, ERROR_CODES.DUPLICATE, 'A discount with this name already exists', [{ field: 'name', message: 'Already exists' }]);
  }
  return toDto(await discountRepository.create({ name, percentage }));
}

module.exports = { list, create };
