// Shop logos: stored under generated names in this service's own folder (see @pos-cafe/shared/uploads).
const { createFileStore, generatedName } = require('@pos-cafe/shared/uploads');
const { uploads } = require('../../config');

const files = createFileStore(uploads.settingsDir);

async function saveSettingsImage(buffer, type) {
  const filename = generatedName(type);
  await files.write(filename, buffer);
  return filename;
}

const removeSettingsImage = (filename) => files.remove(filename);
const settingsImageUrl = (filename) => (filename ? `${uploads.settingsPublicPath}/${filename}` : null);

module.exports = { saveSettingsImage, removeSettingsImage, settingsImageUrl };
