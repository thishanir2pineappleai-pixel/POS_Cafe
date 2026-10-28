import DeleteButton from '../../components/buttons/DeleteButton.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import { EditIcon, EyeIcon } from '../../components/common/Icons.jsx';
import { productImage } from '../../utils/formatImage.js';
import { formatPrice } from './menuFormat.js';

const BADGE = { 'In Stock': 'in', 'Low Stock': 'low', 'Out of stock': 'out' };

// The status is decided by the Menu Service (quantity 0 = out of stock; below the low-stock alert = low stock).
export function StatusBadge({ product }) {
  return <span className={`badge badge--${BADGE[product.status]}`}>{product.status}</span>;
}

const COLUMNS = ['Product', 'Product ID', 'Category', 'Price', 'Stock', 'Status', 'Action'];

export default function ProductTable({ products, onView, onEdit, onDelete }) {
  return (
    <div className="ptable-wrap">
      <div className="ptable" role="table">
        <div className="ptable__row ptable__head" role="row">
          {COLUMNS.map((c) => <span key={c} role="columnheader">{c}</span>)}
        </div>
        {products.length === 0 && <EmptyState message="No products found" />}
        {products.map((p) => (
          <div className="ptable__row" role="row" key={p.id}>
            <span className="ptable__product">
              <img src={productImage(p.image)} alt="" />
              {p.name}
            </span>
            <span>{p.code}</span>
            <span>{p.category}</span>
            <span className="ptable__num">{formatPrice(p.sellingPrice)}</span>
            <span className="ptable__num">{p.quantity}</span>
            <span><StatusBadge product={p} /></span>
            <span className="ptable__actions">
              <button type="button" className="icon-btn icon-btn--green" onClick={() => onView(p)} aria-label={`View ${p.name}`} title="View">
                <EyeIcon size={15} />
              </button>
              <button type="button" className="icon-btn icon-btn--orange" onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`} title="Edit">
                <EditIcon size={15} />
              </button>
              <DeleteButton onClick={() => onDelete(p)} label={`Delete ${p.name}`} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
