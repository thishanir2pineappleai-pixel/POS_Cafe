import { CheckIcon } from '../components/common/Icons.jsx';

export const STAFF_STEPS = ['Personal Information', 'Employment Details', 'Employment Records'];

// Add Staff progress bar. current is 1-3; earlier steps show a check mark, later ones stay grey.
export default function StaffStepper({ current }) {
  return (
    <ol className="staff-stepper" aria-label="Add staff progress">
      {STAFF_STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'current' : 'todo';
        return (
          <li key={label} className={`staff-stepper__step staff-stepper__step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="staff-stepper__circle">{state === 'done' ? <CheckIcon size={13} strokeWidth={3} /> : n}</span>
            <span className="staff-stepper__label">{label}</span>
            {n < STAFF_STEPS.length && <span className="staff-stepper__line" />}
          </li>
        );
      })}
    </ol>
  );
}
