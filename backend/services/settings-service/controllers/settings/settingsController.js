// Settings > Profile endpoints that are not the shop profile itself: the timezone options.
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const { TIMEZONES } = require('../../config/constants/timezones');

const timezones = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: TIMEZONES });
});

module.exports = { timezones };
