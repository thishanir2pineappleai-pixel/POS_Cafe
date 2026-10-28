const multer = require('multer');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../../config/constants/messages');
const { DOC_MAX_BYTES } = require('../../services/storage/documentService');

// One file from the field "file", held in memory, at most 5 MB, no text fields. The real type is checked from the bytes
// in the service (each document slot allows different types), never from the client's MIME type.
const single = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOC_MAX_BYTES, files: 1, fields: 0, parts: 2 },
}).single('file');

function uploadDocument(req, res, next) {
  single(req, res, (err) => {
    if (!err) {
      if (!req.file) return next(new AppError(400, ERROR_CODES.VALIDATION_ERROR, MESSAGES.DOCUMENT_MISSING));
      return next();
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, ERROR_CODES.IMAGE_TOO_LARGE, MESSAGES.DOCUMENT_TOO_LARGE));
      return next(new AppError(400, ERROR_CODES.VALIDATION_ERROR, MESSAGES.DOCUMENT_MISSING, [{ field: 'file', message: err.message }]));
    }
    return next(err);
  });
}

module.exports = { uploadDocument };
