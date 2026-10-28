import { useState } from 'react';
import { uploadUrl } from '../../api/client.js';
import AddButton from '../../components/buttons/AddButton.jsx';
import CancelButton from '../../components/buttons/CancelButton.jsx';
import RemoveButton from '../../components/buttons/RemoveButton.jsx';
import SaveButton from '../../components/buttons/SaveButton.jsx';
import { ChevronDownIcon, PlusIcon } from '../../components/common/Icons.jsx';
import IngredientAutocomplete from '../../components/common/IngredientAutocomplete.jsx';
import AddCategoryModal from '../../components/modals/AddCategoryModal.jsx';
import AddDiscountModal from '../../components/modals/AddDiscountModal.jsx';
import ConfirmationModal from '../../components/modals/ConfirmationModal.jsx';
import SelectCategoryModal from '../../components/modals/SelectCategoryModal.jsx';
import SelectDiscountModal from '../../components/modals/SelectDiscountModal.jsx';
import ImageUpload from '../../components/upload/ImageUpload.jsx';
import { parsePrice, validateProduct } from '../../validation/productValidation.js';
import { formatPrice } from './menuFormat.js';

const BLANK = {
  name: '', category: '', costPrice: '', sellingPrice: '', quantity: '',
  discountType: '', lowStockAlert: '', image: null, imageFile: null, ingredients: [],
};

const fromProduct = (p) => ({
  name: p.name,
  category: p.category,
  costPrice: p.costPrice === null ? '' : formatPrice(p.costPrice),
  sellingPrice: formatPrice(p.sellingPrice),
  quantity: String(p.quantity),
  discountType: p.discountType ?? '',
  lowStockAlert: p.lowStockAlert === null ? '' : String(p.lowStockAlert),
  image: uploadUrl(p.image),
  imageFile: null,
  ingredients: p.ingredients.map((i) => ({ name: i.name, quantity: i.quantity })),
});

// Add / Edit Menu Item form. mode: 'add' | 'edit'. `categories` are names, `discounts` are { name, percentage },
// `ingredientOptions` are { id, name } suggestions. onSave(data) saves with the Menu Service and resolves to { ok, error?, fields? };
// onAddCategory(name) / onAddDiscount({ name, percentage }) resolve the same way. The form stays open on a refusal.
export default function ProductForm({
  mode, product, categories, discounts, ingredientOptions = [], onAddCategory, onAddDiscount, onCancel, onSave,
}) {
  const [values, setValues] = useState(product ? fromProduct(product) : BLANK);
  const [errors, setErrors] = useState({});
  const [modal, setModal] = useState(null); // selCat | addCat | selDisc | addDisc | confirm
  const [ingName, setIngName] = useState('');
  const [ingQty, setIngQty] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, _form: undefined }));
  };
  const input = (key, placeholder) => (
    <input className={`input${errors[key] ? ' has-error' : ''}`} value={values[key]} placeholder={placeholder}
      onChange={(e) => set(key, e.target.value)} />
  );

  const addIngredient = () => {
    const name = ingName.trim();
    const quantity = ingQty.trim();
    if (!name || !quantity) return;
    if (values.ingredients.some((i) => i.name.toLowerCase() === name.toLowerCase())) return; // the server refuses a name listed twice
    const known = ingredientOptions.find((o) => o.name.toLowerCase() === name.toLowerCase());
    setValues((v) => ({ ...v, ingredients: [...v.ingredients, { name: known?.name ?? name, quantity }] })); // a new name is created by the server on save
    setIngName('');
    setIngQty('');
  };
  const removeIngredient = (index) =>
    setValues((v) => ({ ...v, ingredients: v.ingredients.filter((_, i) => i !== index) }));

  const requestSave = () => {
    const found = validateProduct(values);
    setErrors(found);
    if (Object.keys(found).length === 0) setModal('confirm');
  };

  const confirmSave = async () => {
    if (saving) return;
    setSaving(true);
    const result = await onSave({
      name: values.name.trim(),
      category: values.category,
      costPrice: values.costPrice.trim() === '' ? undefined : parsePrice(values.costPrice), // optional
      sellingPrice: parsePrice(values.sellingPrice),
      quantity: Number(values.quantity),
      lowStockAlert: values.lowStockAlert.trim() === '' ? undefined : Number(values.lowStockAlert), // optional: no default is assumed
      discountType: values.discountType,
      imageFile: values.imageFile,
      ingredients: values.ingredients,
    });
    if (!result.ok) { setSaving(false); setModal(null); setErrors({ ...result.fields, _form: result.error }); }
  };

  const unusedOptions = ingredientOptions.filter((o) => !values.ingredients.some((i) => i.name.toLowerCase() === o.name.toLowerCase()));
  const edit = mode === 'edit';

  return (
    <section className="panel form">
      <h2 className="form__title">Item Details</h2>

      <div className="form__grid">
        <label className="field">
          <span className="field-label">Item Name</span>
          {input('name', 'Enter the name of the item')}
        </label>
        <div className="field">
          <span className="field-label">Category</span>
          <div className="select-row">
            <button type="button" className={`input input-select${values.category ? '' : ' is-placeholder'}${errors.category || errors.categoryId ? ' has-error' : ''}`}
              onClick={() => setModal('selCat')}>
              <span>{values.category || 'Select a category'}</span>
              <ChevronDownIcon size={14} />
            </button>
            <button type="button" className="square-add" onClick={() => setModal('addCat')} aria-label="Add category"><PlusIcon size={18} /></button>
          </div>
        </div>
        <label className="field">
          <span className="field-label">Cost Price</span>
          {input('costPrice', 'Enter price (Rs)')}
        </label>

        <label className="field">
          <span className="field-label">Selling Price</span>
          {input('sellingPrice', 'Enter the selling price')}
        </label>
        <div className="field">
          <span className="field-label">Item Photo</span>
          <ImageUpload value={values.image} onChange={(url, file) => { set('image', url); set('imageFile', file); }} />
        </div>
        <label className="field">
          <span className="field-label">Quantity</span>
          {input('quantity', 'Type your quantity')}
        </label>
      </div>

      <h3 className="form__section">Discount (Optional)</h3>
      <div className="form__grid">
        <div className="field">
          <span className="field-label">Discount Type</span>
          <div className="select-row">
            <button type="button" className={`input input-select${values.discountType ? '' : ' is-placeholder'}`} onClick={() => setModal('selDisc')}>
              <span>{values.discountType || 'Discount Type'}</span>
              <ChevronDownIcon size={14} />
            </button>
            <button type="button" className="square-add" onClick={() => setModal('addDisc')} aria-label="Add discount"><PlusIcon size={18} /></button>
          </div>
        </div>
        <label className="field">
          <span className="field-label">Low Stock Alert</span>
          {input('lowStockAlert', 'Enter Low Stock Alert')}
        </label>
      </div>

      <h3 className="form__section">Ingredients Details</h3>
      <div className="ingredient-row">
        <div className="field">
          <span className="field-label">Ingredient Name</span>
          <IngredientAutocomplete value={ingName} onChange={setIngName} options={unusedOptions} placeholder="Enter and Select Ingredient Name" />
        </div>
        <label className="field">
          <span className="field-label">Quantity</span>
          <input className="input" value={ingQty} placeholder="Quantity" onChange={(e) => setIngQty(e.target.value)} />
        </label>
        <AddButton label="Add Ingredient" onClick={addIngredient} />
      </div>
      {values.ingredients.map((ing, i) => (
        <div className="ingredient-row ingredient-row--added" key={ing.name.toLowerCase()}>
          <input className="input" value={ing.name} readOnly aria-label="Ingredient name" />
          <input className="input" value={ing.quantity} aria-label="Quantity"
            onChange={(e) => setValues((v) => ({
              ...v, ingredients: v.ingredients.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x)),
            }))} />
          <RemoveButton onClick={() => removeIngredient(i)} />
        </div>
      ))}
      {errors._form && <span className="field-error" role="alert">{errors._form}</span>}

      <div className="form__actions">
        <CancelButton onClick={onCancel} />
        <SaveButton label="Save Item" onClick={requestSave} />
      </div>

      {modal === 'selCat' && (
        <SelectCategoryModal categories={categories} selected={values.category} onClose={() => setModal(null)}
          onSelect={(name) => { set('category', name); setModal(null); }} />
      )}
      {modal === 'addCat' && (
        <AddCategoryModal onClose={() => setModal(null)}
          onSave={async (name) => {
            const result = await onAddCategory(name);
            if (result.ok) { set('category', name); setModal(null); }
            return result;
          }} />
      )}
      {modal === 'selDisc' && (
        <SelectDiscountModal discounts={discounts} selected={values.discountType} onClose={() => setModal(null)}
          onSelect={(name) => { set('discountType', name); setModal(null); }} />
      )}
      {modal === 'addDisc' && (
        <AddDiscountModal onClose={() => setModal(null)}
          onSave={async (discount) => {
            const result = await onAddDiscount(discount);
            if (result.ok) { set('discountType', discount.name); setModal(null); }
            return result;
          }} />
      )}
      {modal === 'confirm' && (
        <ConfirmationModal
          message={edit ? 'Click "Save Changes" to update the product.' : 'Click "Save" to add the product.'}
          confirmLabel={saving ? 'Saving...' : edit ? 'Save Changes' : 'Save'}
          onCancel={() => setModal(null)} onConfirm={confirmSave} />
      )}
    </section>
  );
}
