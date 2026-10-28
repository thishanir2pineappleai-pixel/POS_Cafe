// Green on/off switch with an optional label ("Active" / "Inactive", "Allowed" / "Not Allowed"). Same look as the Sales discount toggle.
export default function StatusToggle({ checked, label, ariaLabel, onChange, disabled = false }) {
  return (
    <div className="status-toggle">
      <button type="button" role="switch" aria-checked={checked} className="switch" disabled={disabled}
        aria-label={ariaLabel ?? label} onClick={() => onChange(!checked)} />
      {label && <span className="status-toggle__label">{label}</span>}
    </div>
  );
}
