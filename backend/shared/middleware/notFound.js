const { ERROR_CODES } = require('../errors');
const { MESSAGES } = require('../messages');
const { AppError } = require('../errors');

const notFound = (req, res, next) => next(new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.ROUTE_NOT_FOUND));

module.exports = notFound;
