// Product photos: stored under generated names in this service's own folder (see @pos-cafe/shared/uploads).
const { createFileStore, generatedName } = require('@pos-cafe/shared/uploads');
const { uploads } = require('../../config');

const files = createFileStore(uploads.productsDir);

async function saveProductImage(buffer, type) {
  const filename = generatedName(type);
  await files.write(filename, buffer);
  return filename;
}

const removeProductImage = (filename) => files.remove(filename);
const productImageUrl = (filename) => (filename ? `${uploads.publicPath}/${filename}` : null);

module.exports = { saveProductImage, removeProductImage, productImageUrl };
