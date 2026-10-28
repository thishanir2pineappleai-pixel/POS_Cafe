// Success responses always look like { success: true, message?, data?, meta? }.
function sendSuccess(res, { status = 200, message, data, meta } = {}) {
  const body = { success: true };
  if (message !== undefined) body.message = message;
  if (data !== undefined) body.data = data;
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
}

module.exports = { sendSuccess };
