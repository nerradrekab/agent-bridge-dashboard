import { Link } from 'react-router-dom';
import { EmptyState } from '../components/QueryBoundary';

export function NotFound() {
  return (
    <EmptyState title="Page not found">
      <Link to="/" className="text-accent hover:underline">
        Back to the overview
      </Link>
    </EmptyState>
  );
}
