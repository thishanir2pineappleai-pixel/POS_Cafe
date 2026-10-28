// A failed load, in the same place the data would have been. `onRetry` (optional) adds a "Try again" link.
export default function ErrorState({ message, onRetry }) {
  return (
    <div className="empty-state" role="alert">
      {message}{' '}
      {onRetry && <button type="button" className="link-btn link-btn--bold" onClick={onRetry}>Try again</button>}
    </div>
  );
}
