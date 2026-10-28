const { Router } = require('express');
const authController = require('../../controllers/auth/authController');
const loginController = require('../../controllers/auth/loginController');
const logoutController = require('../../controllers/auth/logoutController');
const otpController = require('../../controllers/auth/otpController');
const passwordController = require('../../controllers/auth/passwordController');
const registerController = require('../../controllers/auth/registerController');
const authenticate = require('../../middleware/auth/authenticate');
const { rateLimit, byEmail, byIp, byIpAndEmail } = require('../../middleware/security/rateLimiter');
const v = require('../../middleware/validation/authValidation');
const { policy } = require('../../config');

const limits = policy.rateLimits;
const router = Router();

// ---- Sign in / out ----
router.post('/login', rateLimit({ name: 'login', ...limits.login, key: byIpAndEmail }), v.validateLogin, loginController.login);
router.post('/logout', authenticate, logoutController.logout);
router.get('/me', authenticate, authController.me);

// ---- Signup (steps in order; every step after the first needs the registrationToken from step 1) ----
const verifyLimit = rateLimit({ name: 'verify', ...limits.verify, key: byIp });
const resendLimit = rateLimit({ name: 'resend', ...limits.resend, key: byIp });
router.post('/signup/credentials', rateLimit({ name: 'signupCredentials', ...limits.signupCredentials, key: byIp }), v.validateCredentials, registerController.credentials);
router.post('/signup/email/verify', verifyLimit, v.validateRegistrationCode, otpController.verifyEmail);
router.post('/signup/email/resend', resendLimit, v.validateRegistrationToken, otpController.resendEmail);
router.post('/signup/owner', v.validateOwner, registerController.owner);
router.post('/signup/phone/verify', verifyLimit, v.validateRegistrationCode, otpController.verifyPhone);
router.post('/signup/phone/resend', resendLimit, v.validateRegistrationToken, otpController.resendPhone);
router.post('/signup/business', v.validateBusiness, registerController.business);
router.post('/signup/activate', rateLimit({ name: 'activate', ...limits.activate, key: byIpAndEmail }), v.validateActivate, registerController.activate);
router.post('/signup/access-key/resend', rateLimit({ name: 'accessKeyResend', ...limits.resend, key: byIpAndEmail }), v.validateEmailOnly, registerController.resendAccessKey);

// ---- Forgot / reset password ----
router.post('/forgot-password',
  rateLimit({ name: 'forgotPassword', ...limits.forgotPassword, key: byEmail }),
  rateLimit({ name: 'forgotPasswordIp', ...limits.forgotPasswordIp, key: byIp }),
  v.validateEmailOnly, passwordController.forgotPassword);
router.post('/forgot-password/verify', verifyLimit, v.validateForgotVerify, passwordController.verifyResetCode);
router.post('/reset-password', rateLimit({ name: 'resetPassword', ...limits.resetPassword, key: byIp }), v.validateReset, passwordController.resetPassword);

module.exports = router;
