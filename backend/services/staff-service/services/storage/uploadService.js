// The two private upload folders of the Staff Service (see @pos-cafe/shared/uploads for the safety rules).
const { createFileStore } = require('@pos-cafe/shared/uploads');
const { uploads } = require('../../config');

const images = createFileStore(uploads.staffDir);
const documents = createFileStore(uploads.staffDocumentsDir);

module.exports = {
  writeStaffImage: images.write,
  readStaffImage: images.read,
  removeStaffImage: images.remove,
  writeStaffDocument: documents.write,
  readStaffDocument: documents.read,
  removeStaffDocument: documents.remove,
};
