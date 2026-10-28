import { CheckIcon } from '../components/common/Icons.jsx';

const STEPS = [
  ['Account credentials', 'Login details for account access'],
  ['Email verification', 'Security step to validate email ownership'],
  ["Owner's details", "Share the owner's personal details."],
  ['Phone number verification', 'Security step to validate phonenumber ownership'],
  ['Business details', 'Enter key information about the business.'],
];

// current: 1-5 is the active step; anything above 5 shows every step as completed.
export default function SignupStepper({ current }) {
  return (
    <ol className="stepper" aria-label="Sign up progress">
      {STEPS.map(([label, hint], i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'current' : 'todo';
        return (
          <li key={label} className={`stepper__step stepper__step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="stepper__circle">{state === 'done' ? <CheckIcon size={26} strokeWidth={3} /> : String(n).padStart(2, '0')}</span>
            <span className="stepper__label">{label}</span>
            <span className="stepper__hint">{hint}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Page frame of every Signup screen: the stepper band, then an optional title and subtitle, then the content.
export function SignupLayout({ current, title, subtitle, children }) {
  return (
    <div className="signup-page">
      <SignupStepper current={current} />
      <div className="signup-body">
        {title && <h1 className="signup-title">{title}</h1>}
        {subtitle && <h2 className="signup-subtitle">{subtitle}</h2>}
        {children}
      </div>
    </div>
  );
}
