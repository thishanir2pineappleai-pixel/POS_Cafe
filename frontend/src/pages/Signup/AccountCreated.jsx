import NextButton from '../../components/buttons/NextButton.jsx';
import { AtSignIcon, BookOpenIcon, CheckCircleIcon, HelpCircleIcon, MessageCircleIcon } from '../../components/common/Icons.jsx';
import { SignupLayout } from '../../stepper/SignupStepper.jsx';

const NEXT_STEPS = [
  'Check your email for the access key once verification is complete.',
  'Enter the access key to activate your account.',
  'Login with your credentials after activation.',
  'Start managing inventory, processing sales, and monitoring reports.',
];

// Final signup screen: the account exists but is not active until the access key is entered. `notice` is shown when the server
// could not send the access key (no email provider is configured yet).
// "View online guide" has no destination in the design, so it does nothing yet.
export default function AccountCreated({ onNext, onFaq, onHelp, notice }) {
  return (
    <SignupLayout current={6}>
      <div className="created">
        <h1 className="created__title">Account successfully created</h1>
        <p className="created__lead">Your account has been created. Please wait while we verify your details.</p>
        <ul className="created__points">
          <li><AtSignIcon size={14} />Once approved, an access key will be sent to your registered email.</li>
          <li className="created__point--check"><CheckCircleIcon size={14} />Enjoy a seamless POS experience designed for luxury retail.</li>
        </ul>
        <div className="created__steps">
          <h2>Next Steps:</h2>
          <ol>
            {NEXT_STEPS.map((text, i) => <li key={text}><span>{i + 1}</span>{text}</li>)}
          </ol>
          <button type="button" className="created__guide"><BookOpenIcon size={15} />View online guide</button>
          <div className="created__links">
            <button type="button" className="link-btn link-btn--bold" onClick={onFaq}><MessageCircleIcon size={12} />View FAQ</button>
            <button type="button" className="link-btn link-btn--bold" onClick={onHelp}><HelpCircleIcon size={12} />Need help</button>
          </div>
        </div>
        {notice && <p className="auth-error auth-error--small" role="status">{notice}</p>}
        <p className="created__foot">Continue by tapping 'Next' and entering your access key.</p>
        <NextButton block dark onClick={onNext} />
      </div>
    </SignupLayout>
  );
}
