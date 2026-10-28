export default function CancelButton({ label = 'Cancel', onClick, className = '' }) {
  return (
    <button type="button" className={`btn btn-cancel btn-wide ${className}`} onClick={onClick}>
      {label}
    </button>
  );
}
