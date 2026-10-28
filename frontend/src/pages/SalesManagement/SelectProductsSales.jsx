import { useMemo, useState } from 'react';
import CancelButton from '../../components/buttons/CancelButton.jsx';
import SaveButton from '../../components/buttons/SaveButton.jsx';
import SearchInput from '../../components/common/SearchInput.jsx';
import { BoxOutlineIcon } from '../../components/common/Icons.jsx';
import ProductFilter from '../../components/filters/ProductFilter.jsx';
import { ModalShell } from '../../components/modals/ConfirmationModal.jsx';
import { formatRS } from '../../api/formatCurrency.js';

const OPTIONS = [
  { id: 'all', title: 'All Products', hint: 'Apply discount for all products.' },
  { id: 'selected', title: 'Select Products', hint: 'Apply discount for specific product / category' },
];

// "Select Product" (apply) / "Update Product" (edit) dialog.
// selection = { mode: 'all' | 'selected' | null, productIds: [] }
export default function SelectProductsSales({ title, products, selection, error, onChange, onApply, onCancel }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const { mode, productIds } = selection;

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort(), [products]);
  const groups = useMemo(() => categories.map((c) => [c, products.filter((p) => p.category === c).length]), [categories, products]);
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((p) => (!category || p.category === category)
      && (!term || p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term)));
  }, [products, query, category]);

  const allShownChecked = shown.length > 0 && shown.every((p) => productIds.includes(p.id));
  const toggle = (id) => onChange({ mode, productIds: productIds.includes(id) ? productIds.filter((x) => x !== id) : [...productIds, id] });
  const toggleAll = () => onChange({
    mode,
    productIds: allShownChecked
      ? productIds.filter((id) => !shown.some((p) => p.id === id))
      : [...new Set([...productIds, ...shown.map((p) => p.id)])],
  });

  return (
    <ModalShell className="modal--wide modal--products">
      <h2 className="modal__title">{title}</h2>
      <p className="modal__sub">Choose products or category to apply discount</p>

      <div className="opt-cards">
        {OPTIONS.map((o) => (
          <button type="button" key={o.id} className={`opt-card${mode === o.id ? ' is-on' : ''}`} onClick={() => onChange({ mode: o.id, productIds })}>
            <BoxOutlineIcon size={22} />
            <span><strong>{o.title}</strong><small>{o.hint}</small></span>
          </button>
        ))}
      </div>

      {mode === 'all' && (
        <div className="pick-panel">
          <h3 className="pick-panel__title">Selected Products/ Category</h3>
          <div className="pick-table">
            <div className="pick-row pick-row--2 pick-head"><span>Category</span><span>Products</span></div>
            {groups.map(([name, count]) => (
              <div className="pick-row pick-row--2" key={name}><span>{name}</span><span>{count} Items</span></div>
            ))}
          </div>
        </div>
      )}

      {mode === 'selected' && (
        <div className="pick-panel">
          <div className="pick-panel__bar">
            <h3 className="pick-panel__title">Select Products/ Category</h3>
            <SearchInput value={query} onChange={setQuery} placeholder="Search Product name, category" />
          </div>
          <div className="pick-table">
            <div className="pick-row pick-row--4 pick-head">
              <span className="pick-check"><input type="checkbox" checked={allShownChecked} onChange={toggleAll} aria-label="Select all" />Select</span>
              <span>Product</span>
              <ProductFilter value={category} categories={categories} onChange={setCategory} />
              <span>Price</span>
            </div>
            {shown.length === 0 && <div className="empty-state">No products found</div>}
            {shown.map((p) => (
              <div className="pick-row pick-row--4" key={p.id}>
                <span className="pick-check pick-check--row">
                  <input type="checkbox" checked={productIds.includes(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.name}`} />
                </span>
                <span className="pick-product"><img src={p.image} alt="" />{p.name}</span>
                <span className="m">{p.category}</span>
                <span>{formatRS(p.sellingPrice)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {error && <span className="field-error">{error}</span>}

      <div className="modal__actions modal__actions--wide">
        <CancelButton onClick={onCancel} />
        <SaveButton label="Apply Discount" className="btn-next" onClick={onApply} />
      </div>
    </ModalShell>
  );
}
