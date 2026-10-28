// Staff endpoints. Thin: the services hold the rules.
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { MESSAGES } = require('../../config/constants/messages');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const staffService = require('../../services/user/staffService');

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await staffService.list(req.auth, req.valid.query);
  sendSuccess(res, { data: items, meta });
});
const summary = asyncHandler(async (req, res) => sendSuccess(res, { data: await staffService.summary(req.auth, req.valid.query) }));
const get = asyncHandler(async (req, res) => sendSuccess(res, { data: await staffService.get(req.auth, req.valid.id) }));
const create = asyncHandler(async (req, res) => sendSuccess(res, {
  status: 201, message: MESSAGES.STAFF_CREATED, data: await staffService.create(req.auth, req.valid.query?.shopId, req.valid.body),
}));
const update = asyncHandler(async (req, res) => sendSuccess(res, { message: MESSAGES.STAFF_UPDATED, data: await staffService.update(req.auth, req.valid.id, req.valid.body) }));
const setStatus = asyncHandler(async (req, res) => sendSuccess(res, { message: MESSAGES.STAFF_STATUS_UPDATED, data: await staffService.setStatus(req.auth, req.valid.id, req.valid.body) }));
const remove = asyncHandler(async (req, res) => { await staffService.remove(req.auth, req.valid.id); sendSuccess(res, { message: MESSAGES.STAFF_DELETED }); });
const restore = asyncHandler(async (req, res) => sendSuccess(res, { message: MESSAGES.STAFF_RESTORED, data: await staffService.restore(req.auth, req.valid.id) }));

const uploadImage = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: MESSAGES.STAFF_IMAGE_UPLOADED, data: await staffService.setImage(req.auth, req.valid.id, req.file.buffer, req.imageType) });
});

// Private files: only for signed-in users of the account, never cached by shared caches, never sniffed.
function sendFile(res, { buffer, mime, fileName }) {
  res.status(200).set({
    'Content-Type': mime,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': fileName ? `attachment; filename="${encodeURIComponent(fileName)}"` : 'inline',
  }).send(buffer);
}
const image = asyncHandler(async (req, res) => sendFile(res, await staffService.readImage(req.auth, req.valid.id)));
const uploadDocument = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: MESSAGES.STAFF_DOCUMENT_UPLOADED, data: await staffService.setDocument(req.auth, req.valid.id, req.valid.slot, req.file) });
});
const document = asyncHandler(async (req, res) => sendFile(res, await staffService.readDocument(req.auth, req.valid.id, req.valid.slot)));

module.exports = { list, summary, get, create, update, setStatus, remove, restore, uploadImage, image, uploadDocument, document };
