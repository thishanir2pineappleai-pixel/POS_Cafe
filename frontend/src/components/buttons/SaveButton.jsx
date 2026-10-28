// Primary green action button (Save Item, Save Changes, Save, Add, Update, Delete).
export default function SaveButton({ label = 'Save', onClick, type = 'button', className = '' }) {
  return (
    <button type={type} className={`btn btn-primary btn-wide ${className}`} onClick={onClick}>
      {label}
    </button>
  );
}
