import { StatusBadge } from '../../components/OneTimeUsable/ProductTable.jsx';
import { ArrowLeftIcon, EditIcon } from '../../components/common/Icons.jsx';
import { productImage } from '../../api/formatImage.js';
import { formatPrice } from './menuFormat.js';

function Info({ label, note, children }) {
  return (
    <div className="info">
      <div className="info__label">{label}{note && <span> {note}</span>}</div>
      <div className="info__value">{children}</div>
    </div>
  );
}

// `product` is one product from the Menu Service, with its ingredients.
export default function ProductDetails({ product, onBack, onEdit, onEditIngredient }) {
  return (
    <section className="panel details">
      <div className="details__top">
        <button type="button" className="btn btn-outline" onClick={onBack}><ArrowLeftIcon size={16} />Back</button>
        <button type="button" className="btn btn-outline-green" onClick={onEdit}><EditIcon size={16} />Edit Product</button>
      </div>

      <div className="details__body">
        <div className="details__main">
          <div className="details__title">
            <h2>{product.name}</h2>
            <StatusBadge product={product} />
          </div>
          <div className="details__id">{product.code}</div>

          <div className="details__grid">
            <Info label="Category">{product.category}</Info>
            <Info label="Quantity">{product.quantity}</Info>
            <Info label="Cost Price">{product.costPrice === null ? '-' : formatPrice(product.costPrice)}</Info>
            <Info label="Selling Price">{formatPrice(product.sellingPrice)}</Info>
            <Info label="Discount Type">{product.discountType || '-'}</Info>
            <Info label="Discount Percentage">{product.discountPercentage === null ? '-' : `${product.discountPercentage}%`}</Info>
            <Info label="Low Stock Alert" note="(When Quantity goes below)">{product.lowStockAlert ?? '-'}</Info>
          </div>
        </div>
        <div className="details__photo"><img src={productImage(product.image)} alt={product.name} /></div>
      </div>

      <h3 className="details__section">Ingredients Information</h3>
      <div className="itable">
        <div className="itable__row itable__head">
          <span>Ingredient ID</span><span>Ingredient Name</span><span>Quantity</span><span>Action</span>
        </div>
        {product.ingredients.map((ing) => (
          <div className="itable__row" key={ing.id}>
            <span>{ing.code}</span>
            <span>{ing.name}</span>
            <span>{ing.quantity}</span>
            <span>
              <button type="button" className="icon-btn icon-btn--orange icon-btn--sm" onClick={() => onEditIngredient(ing)}
                aria-label={`Edit ${ing.name}`} title="Edit">
                <EditIcon size={12} />
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
