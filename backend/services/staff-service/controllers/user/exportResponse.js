// Shared by the Staff Management export routes: CSV only. PDF and XLS need a library that is not approved, so they answer 501.
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../../config/constants/messages');

function sendCsv(res, format, filename, csvPromise) {
  if (format !== 'csv') throw new AppError(501, ERROR_CODES.NOT_IMPLEMENTED, MESSAGES.EXPORT_FORMAT_NOT_IMPLEMENTED);
  return csvPromise.then((csv) => res.status(200)
    .set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' })
    .send(csv));
}

module.exports = { sendCsv };
