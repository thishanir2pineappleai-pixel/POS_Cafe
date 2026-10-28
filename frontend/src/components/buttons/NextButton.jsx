// Green "Next" button of the Signup steps. block = full width of the card; dark = the darker green of the last screens.
export default function NextButton({ label = 'Next', onClick, type = 'button', block = false, dark = false }) {
  return (
    <button type={type} className={`signup-btn${block ? ' signup-btn--block' : ''}${dark ? ' signup-btn--dark' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}
