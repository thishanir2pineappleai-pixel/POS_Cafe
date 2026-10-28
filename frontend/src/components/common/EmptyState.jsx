export default function EmptyState({ message = 'No data found' }) {
  return <div className="empty-state">{message}</div>;
}
