// Staff documents (CV/Resume, ID copy, Employment agreement). The type is decided from the file's BYTES, never from the
// client's file name or Content-Type, and each document slot accepts only the types the Figma lists for it:
//   cv: PDF or DOC/DOCX      idCopy: JPG, PNG or PDF      agreement: PDF
// ponytail: this catches renamed and truncated files, it does not scan for malware. DOCX is recognised as a ZIP that
// contains word/ entries; legacy DOC by its OLE signature. Add a virus scan before real files are accepted in production.
const crypto = require('node:crypto');
const { detectImageType } = require('./imageService');
const uploadService = require('./uploadService');

const DOC_MAX_BYTES = 5 * 1024 * 1024; // CONFIRMED by the Figma ("Max 5MB")
const ALLOWED = Object.freeze({
  cv: ['pdf', 'doc', 'docx'],
  idCopy: ['jpg', 'png', 'pdf'],
  agreement: ['pdf'],
});
const MIME = Object.freeze({
  pdf: 'application/pdf', doc: 'application/msword', png: 'image/png', jpg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});
const DOCUMENT_TYPES = Object.freeze(Object.keys(ALLOWED));

const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function detectDocumentType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const image = detectImageType(buffer);
  if (image) return image === 'jpeg' ? 'jpg' : 'png';
  // PDF: starts with %PDF- and ends with %%EOF (trailing whitespace allowed)
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-' && buffer.subarray(-1024).toString('latin1').trimEnd().endsWith('%%EOF')) return 'pdf';
  if (buffer.subarray(0, 8).equals(OLE)) return 'doc';
  if (buffer.subarray(0, 4).equals(ZIP) && buffer.includes(Buffer.from('word/'))) return 'docx';
  return null;
}

const isAllowed = (slot, type) => Boolean(type) && ALLOWED[slot].includes(type);

// Stores the file under a generated name; returns what the staff record keeps.
async function saveDocument(buffer, type, originalName) {
  const storedName = `${crypto.randomUUID()}.${type}`;
  await uploadService.writeStaffDocument(storedName, buffer);
  // The client's file name is only a label: it is cut to a safe, short, printable text and never used as a path.
  const label = String(originalName || '').replace(/[^\w.\- ()]/g, '_').slice(-80) || `document.${type}`;
  return { storedName, fileName: label, type, size: buffer.length, uploadedAt: new Date().toISOString() };
}

module.exports = { DOC_MAX_BYTES, DOCUMENT_TYPES, MIME, detectDocumentType, isAllowed, saveDocument };
