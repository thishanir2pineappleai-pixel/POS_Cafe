// Admin pictures: stored under generated names in this service's own folder (see @pos-cafe/shared/uploads).
const { createFileStore, generatedName } = require('@pos-cafe/shared/uploads');
const { uploads } = require('../../config');

const files = createFileStore(uploads.adminsDir);

async function saveAdminImage(buffer, type) {
  const filename = generatedName(type);
  await files.write(filename, buffer);
  return filename;
}

const removeAdminImage = (filename) => files.remove(filename);
const adminImageUrl = (filename) => (filename ? `${uploads.adminsPublicPath}/${filename}` : null);

module.exports = { saveAdminImage, removeAdminImage, adminImageUrl };
