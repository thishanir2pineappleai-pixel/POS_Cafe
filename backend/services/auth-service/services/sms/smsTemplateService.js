const { policy } = require('../../config');

const verificationCode = (code) =>
  `Your PAI POS verification code is ${code}. It expires in ${Math.round(policy.otp.ttlMs / 60000)} minutes.`;

module.exports = { verificationCode };
