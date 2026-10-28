export default function LoadingState({ message = 'Loading...' }) {
  return <div className="empty-state" role="status">{message}</div>;
}
