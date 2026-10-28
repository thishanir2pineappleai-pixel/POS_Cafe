// Sign-in, sign-out and "who am I" (Auth Service, through the Gateway).
// The calls made while signed out (login, signup, password reset) pass `token: null`: they never carry a session token, and a
// 401 from them (wrong password) must not be taken for an ended session.
import { request } from './client.js';

// -> { token, tokenType, expiresAt, user }. Every failure (unknown email, wrong password, disabled account) is the same 401.
export const login = ({ email, password, keepSignedIn }) => request('POST', '/auth/login', { json: { email, password, keepSignedIn: Boolean(keepSignedIn) }, token: null });

// Ends the session on the server, so the token stops working everywhere at once.
export const logout = (token) => request('POST', '/auth/logout', { token });

// The signed-in user and their shops; a 401 means the token is expired, revoked or unknown.
export const me = (token) => request('GET', '/auth/me', { token });

// ---- Signup (five steps, then activation with the access key). `registrationToken` comes from the first step. ----
const post = (path, json) => request('POST', path, { json, token: null });

// -> { registrationToken, expiresAt, nextStep, delivery }. The password rule is checked by the server too.
export const signupCredentials = ({ email, username, password, acceptTerms }) => post('/auth/signup/credentials', { email, username, password, acceptTerms: Boolean(acceptTerms) });
export const verifySignupEmail = (registrationToken, code) => post('/auth/signup/email/verify', { registrationToken, code });
export const resendSignupEmail = (registrationToken) => post('/auth/signup/email/resend', { registrationToken });
export const signupOwner = (registrationToken, { ownerName, phone }) => post('/auth/signup/owner', { registrationToken, ownerName, phone });
export const verifySignupPhone = (registrationToken, code) => post('/auth/signup/phone/verify', { registrationToken, code });
export const resendSignupPhone = (registrationToken) => post('/auth/signup/phone/resend', { registrationToken });
export const signupBusiness = (registrationToken, { businessName, address }) => post('/auth/signup/business', { registrationToken, businessName, address });
export const activateAccount = ({ email, accessKey }) => post('/auth/signup/activate', { email, accessKey });
export const resendAccessKey = (email) => post('/auth/signup/access-key/resend', { email });

// ---- Forgot password: request a code, verify it (-> { resetToken }), then set the new password. ----
export const forgotPassword = (email) => post('/auth/forgot-password', { email });
export const verifyResetCode = ({ email, code }) => post('/auth/forgot-password/verify', { email, code });
export const resetPassword = ({ resetToken, password, confirmPassword }) => post('/auth/reset-password', { resetToken, password, confirmPassword });
