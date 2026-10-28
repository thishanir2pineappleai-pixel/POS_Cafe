import { ChevronLeftIcon, ChevronRightIcon } from './Icons.jsx';

const WINDOW = 5;

export default function Pagination({ page, pageSize, total, onChange, label = 'products' }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const first = Math.min(Math.max(1, page - 2), Math.max(1, totalPages - WINDOW + 1));
  const pages = Array.from({ length: Math.min(WINDOW, totalPages) }, (_, i) => first + i);

  return (
    <div className="pagination">
      <span className="pagination__info">
        {total === 0 ? `Showing 0 of 0 ${label}` : `Showing ${start}-${end} of ${total} ${label}`}
      </span>
      <div className="pagination__pages">
        <button type="button" className="page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <ChevronLeftIcon size={16} />
        </button>
        {pages.map((p) => (
          <button type="button" key={p} className={`page-btn${p === page ? ' is-current' : ''}`} onClick={() => onChange(p)}>
            {p}
          </button>
        ))}
        <button type="button" className="page-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page">
          <ChevronRightIcon size={16} />
        </button>
      </div>
    </div>
  );
}
