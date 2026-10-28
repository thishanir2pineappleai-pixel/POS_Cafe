import { useState } from 'react';
import * as authApi from '../api/authApi.js';
import { emailNotice, phoneNotice, PHONE_SKIPPED_NOTICE, screenAfterOwner } from '../api/deliveryNotice.js';
import { attempt } from '../api/errorHandler.js';
import { useAuth } from '../context/AuthContext.jsx';
import ForgotPassword from '../pages/Login/ForgotPassword.jsx';
import ForgotPasswordOTP from '../pages/Login/ForgotPasswordOTP.jsx';
import Login from '../pages/Login/Login.jsx';
import PasswordResetSuccess from '../pages/Login/PasswordResetSuccess.jsx';
import ResetPassword from '../pages/Login/ResetPassword.jsx';
import AccessKey from '../pages/Signup/AccessKey.jsx';
import AccountCreated from '../pages/Signup/AccountCreated.jsx';
import ContactUs from '../pages/Signup/ContactUs.jsx';
import FAQ from '../pages/Signup/FAQ.jsx';
import Signup from '../pages/Signup/Signup.jsx';
import Signup1 from '../pages/Signup/Signup1.jsx';
import Signup2 from '../pages/Signup/Signup2.jsx';
import Signup3 from '../pages/Signup/Signup3.jsx';
import Signup4 from '../pages/Signup/Signup4.jsx';

const BLANK_SIGNUP = { email: '', username: '', password: '', agreed: false, ownerName: '', phone: '', businessName: '', address: '' };

// The notice under a code screen comes from what the server reported about the delivery (see api/deliveryNotice.js).
const NOT_CONFIGURED = { delivered: false, reason: 'not_configured' };

// The screens shown before sign-in: Login, Forgot Password and the five-step Signup. Every step talks to the Auth Service
// through the Gateway: a step moves on only when the server accepts it, and the server's messages are shown on the screen.
// ponytail: no router library is installed, so the current screen is a state value.
export default function AuthFlow() {
  const { signIn } = useAuth();
  const [view, setView] = useState('login');
  const [signup, setSignup] = useState(BLANK_SIGNUP);
  const [registrationToken, setRegistrationToken] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [notice, setNotice] = useState('');
  const [activated, setActivated] = useState(false); // shows "account activated" once on the login screen
  const patchSignup = (patch) => setSignup((s) => ({ ...s, ...patch }));
  const go = (next) => () => setView(next);
  const restartSignup = () => { setSignup(BLANK_SIGNUP); setRegistrationToken(''); setNotice(''); setView('credentials'); };

  // Each handler resolves to { ok, error?, fields? } (see attempt); on success it moves to the next screen. `next` is a screen
  // name, or a function of the server's answer when the server decides the next step.
  const step = (call, next, onData) => async (...args) => {
    const result = await attempt(() => call(...args));
    if (result.ok) { onData?.(result.data); setView(typeof next === 'function' ? next(result.data) : next); }
    return result;
  };
  const resend = (call, noticeOf) => async () => {
    const result = await attempt(() => call(registrationToken));
    if (result.ok) setNotice(noticeOf(result.data.delivery));
    return result;
  };

  switch (view) {
    case 'forgot':
      return (
        <ForgotPassword email={resetEmail} onBackToLogin={go('login')}
          onContinue={async (email) => {
            const result = await attempt(() => authApi.forgotPassword(email));
            if (result.ok) { setResetEmail(email); setNotice(result.data?.deliveryConfigured === false ? emailNotice(NOT_CONFIGURED) : ''); setView('forgotCode'); }
            return result;
          }} />
      );
    case 'forgotCode':
      return (
        <ForgotPasswordOTP email={resetEmail} notice={notice} onBackToLogin={go('login')}
          onVerified={step((code) => authApi.verifyResetCode({ email: resetEmail, code }), 'reset', (data) => setResetToken(data.resetToken))}
          onResend={async () => attempt(() => authApi.forgotPassword(resetEmail))} />
      );
    case 'reset':
      return (
        <ResetPassword onBackToLogin={go('login')}
          onReset={step((password, confirmPassword) => authApi.resetPassword({ resetToken, password, confirmPassword }), 'resetDone', () => setResetToken(''))} />
      );
    case 'resetDone':
      return <PasswordResetSuccess onLogin={go('login')} />;

    case 'credentials':
      return (
        <Signup3 values={signup} onChange={patchSignup} onPrevious={go('login')} notice={notice}
          onNext={step(() => authApi.signupCredentials({ ...signup, acceptTerms: signup.agreed }), 'emailVerify', (data) => { setRegistrationToken(data.registrationToken); setNotice(emailNotice(data.delivery)); })} />
      );
    case 'emailVerify':
      return (
        <Signup4 notice={notice} onNext={step((code) => authApi.verifySignupEmail(registrationToken, code), 'owner', () => setNotice(''))}
          onResend={resend(authApi.resendSignupEmail, emailNotice)} />
      );
    case 'owner':
      // The server decides what follows: the phone-code screen, or (local development only, DEV_SKIP_PHONE_VERIFICATION on the
      // server) straight to the business details with a notice that the phone was NOT verified.
      return (
        <Signup1 values={signup} onChange={patchSignup}
          onNext={step(() => authApi.signupOwner(registrationToken, signup), screenAfterOwner,
            (data) => setNotice(data.phoneVerification === 'skipped' ? PHONE_SKIPPED_NOTICE : phoneNotice(data.delivery)))} />
      );
    case 'phoneVerify':
      return (
        <Signup2 notice={notice} onPrevious={go('owner')} onNext={step((code) => authApi.verifySignupPhone(registrationToken, code), 'business', () => setNotice(''))}
          onResend={resend(authApi.resendSignupPhone, phoneNotice)} />
      );
    case 'business':
      return (
        <Signup values={signup} onChange={patchSignup} notice={notice}
          onNext={step(() => authApi.signupBusiness(registrationToken, signup), 'created', (data) => setNotice(emailNotice(data.delivery)))} />
      );
    case 'created':
      return <AccountCreated notice={notice} onNext={go('accessKey')} onFaq={go('faq')} onHelp={go('contact')} />;
    case 'faq':
      return <FAQ onBack={go('created')} />;
    case 'contact':
      return <ContactUs onBack={go('created')} />;
    case 'accessKey':
      return (
        <AccessKey onBack={go('created')} onResend={() => attempt(() => authApi.resendAccessKey(signup.email))}
          onNext={async (accessKey) => {
            const result = await attempt(() => authApi.activateAccount({ email: signup.email, accessKey }));
            if (result.ok) { setSignup(BLANK_SIGNUP); setRegistrationToken(''); setNotice(''); setActivated(true); setView('login'); }
            return result;
          }} />
      );

    default:
      return (
        <Login onSubmit={signIn} onForgotPassword={() => { setNotice(''); setActivated(false); setView('forgot'); }}
          onSignup={() => { setActivated(false); restartSignup(); }} notice={activated ? 'Your account is activated. Sign in to continue.' : ''} />
      );
  }
}
