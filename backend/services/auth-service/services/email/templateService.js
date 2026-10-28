// Email wording. The text is not in the designs, so it is plain and short.
const { policy } = require('../../config');

const minutes = Math.round(policy.otp.ttlMs / 60000);

const verificationCode = (code) => ({
  subject: 'Your PAI POS verification code',
  text: `Your PAI POS verification code is ${code}. It expires in ${minutes} minutes. If you did not request it, ignore this message.`,
});

const passwordResetCode = (code) => ({
  subject: 'Your PAI POS password reset code',
  text: `Your PAI POS password reset code is ${code}. It expires in ${minutes} minutes. If you did not request it, you can ignore this message.`,
});

const accessKey = (key) => ({
  subject: 'Your PAI POS access key',
  text: `Your PAI POS access key is ${key}. Enter it on the activation screen to activate your account.`,
});

module.exports = { verificationCode, passwordResetCode, accessKey };
