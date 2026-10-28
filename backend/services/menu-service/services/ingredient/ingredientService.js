const { ingredientRepository } = require('../../repositories');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { formatIngredientCode } = require('../../utils/formatter');

const toDto = (row) => ({ id: row.id, code: formatIngredientCode(row.id), name: row.name });

const search = async ({ search: term }) => (await ingredientRepository.search(term)).map(toDto);

async function create({ name }) {
  if (await ingredientRepository.findByName(name)) {
    throw new AppError(409, ERROR_CODES.DUPLICATE, 'An ingredient with this name already exists', [{ field: 'name', message: 'Already exists' }]);
  }
  return toDto(await ingredientRepository.create(name));
}

module.exports = { search, create, toDto };
