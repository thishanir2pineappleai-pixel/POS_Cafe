// Plain green "Previous" text button of the Signup steps.
export default function PreviousButton({ label = 'Previous', onClick }) {
  return <button type="button" className="signup-prev" onClick={onClick}>{label}</button>;
}
