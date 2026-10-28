// Label + control + optional "(Optional)" marker and error text, used by the Settings forms.
export default function FormField({ label, optional = false, error, className = '', children }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">
        {label}
        {optional && <span className="optional"> (Optional)</span>}
      </span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
