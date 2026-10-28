import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main className="not-found">
      <h1>Page not found</h1>
      <p>The page you’re looking for doesn’t exist.</p>
      <Link to="/dashboard">Go to Dashboard</Link>
    </main>
  );
}
