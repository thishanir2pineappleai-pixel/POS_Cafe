// Staff pictures: stored under generated names in a private folder and read back only through the authenticated route.
const { detectImageType, generatedName } = require('@pos-cafe/shared/uploads');
const uploadService = require('./uploadService');

async function saveStaffImage(buffer, type) {
  const filename = generatedName(type);
  await uploadService.writeStaffImage(filename, buffer);
  return filename;
}

module.exports = { detectImageType, saveStaffImage };
