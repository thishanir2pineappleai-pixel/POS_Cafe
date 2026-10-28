// Safe file uploads, shared by every service that stores files (menu photos, shop logos, admin pictures, staff files).
//   * The real type is decided from the file's BYTES; the client's filename and Content-Type are never trusted.
//   * Files are stored under generated <uuid>.<ext> names only, so a name that came from a user can never point outside
//     an upload folder, and an existing file is never overwritten.
//   * Multer keeps the file in memory (never writes it), one file of at most maxBytes in the field "image".
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const multer = require('multer');
const { ERROR_CODES, AppError } = require('./errors');
const { MESSAGES } = require('./messages');

const IMAGE_MAX_BYTES = 2 * 1024 * 1024; // CONFIRMED for product photos (Figma): JPG/PNG, maximum 2 MB.
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_END = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]); // IEND chunk
const EXTENSIONS = { png: 'png', jpeg: 'jpg' };
const SAFE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|pdf|doc|docx)$/;

// PNG: signature and closing IEND chunk. JPEG: FF D8 FF start and FF D9 end (trailing zero padding is allowed).
// ponytail: this catches fake and truncated files but does not decode the pixels.
function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(PNG_HEADER) && buffer.subarray(-12).equals(PNG_END)) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    let end = buffer.length;
    while (end > 2 && buffer[end - 1] === 0x00) end -= 1;
    if (buffer[end - 2] === 0xff && buffer[end - 1] === 0xd9) return 'jpeg';
  }
  return null;
}

const generatedName = (type) => `${crypto.randomUUID()}.${EXTENSIONS[type]}`;

// One upload folder. Unsafe names are never read, written or deleted.
function createFileStore(dir) {
  return {
    async write(filename, buffer) {
      if (!SAFE_NAME.test(filename)) throw new Error('Unsafe upload filename');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, filename), buffer, { flag: 'wx' }); // never overwrite
    },
    // Best effort: a missing file is fine, and an unexpected name is ignored.
    async remove(filename) {
      if (!filename || !SAFE_NAME.test(filename)) return;
      try {
        await fs.unlink(path.join(dir, filename));
      } catch (err) {
        if (err.code !== 'ENOENT') console.error('Could not delete upload', filename, err.message);
      }
    },
    // The file's bytes, or null when the name is unsafe or the file is gone.
    async read(filename) {
      if (!filename || !SAFE_NAME.test(filename)) return null;
      try {
        return await fs.readFile(path.join(dir, filename));
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
  };
}

// { uploadImage, requireImage }: uploadImage reads the multipart field "image" and turns Multer errors into the standard
// JSON errors; requireImage (run after it) checks a file is present and really is a JPEG or PNG (sets req.imageType).
function createImageUpload({ maxBytes = IMAGE_MAX_BYTES } = {}) {
  // No fileFilter on the client's MIME type: the real type is checked from the bytes afterwards.
  const single = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1, fields: 0, parts: 2 } }).single('image');

  function uploadImage(req, res, next) {
    single(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, ERROR_CODES.IMAGE_TOO_LARGE, MESSAGES.IMAGE_TOO_LARGE));
        return next(new AppError(400, ERROR_CODES.VALIDATION_ERROR, MESSAGES.IMAGE_MISSING, [{ field: 'image', message: err.message }]));
      }
      return next(err);
    });
  }

  function requireImage(req, res, next) {
    if (!req.file) return next(new AppError(400, ERROR_CODES.VALIDATION_ERROR, MESSAGES.IMAGE_MISSING));
    const type = detectImageType(req.file.buffer);
    if (!type) return next(new AppError(415, ERROR_CODES.UNSUPPORTED_IMAGE, MESSAGES.IMAGE_UNSUPPORTED));
    req.imageType = type;
    return next();
  }

  return { uploadImage, requireImage };
}

module.exports = { IMAGE_MAX_BYTES, detectImageType, generatedName, createFileStore, createImageUpload };
