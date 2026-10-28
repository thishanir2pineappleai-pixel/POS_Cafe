const { categoryRepository } = require('../../repositories');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');

const toDto = (row) => ({ id: row.id, name: row.name });

const list = async () => (await categoryRepository.list()).map(toDto);

async function create({ name }) {
  if (await categoryRepository.findByName(name)) {
    throw new AppError(409, ERROR_CODES.DUPLICATE, 'A category with this name already exists', [{ field: 'name', message: 'Already exists' }]);
  }
  return toDto(await categoryRepository.create(name));
}

module.exports = { list, create };
