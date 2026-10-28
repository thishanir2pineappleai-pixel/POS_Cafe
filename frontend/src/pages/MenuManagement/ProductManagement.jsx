import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import * as categoryApi from '../../api/categoryApi.js';
import { attempt, messageFor } from '../../api/errorHandler.js';
import * as discountApi from '../../api/discountApi.js';
import * as ingredientApi from '../../api/ingredientApi.js';
import * as productApi from '../../api/productApi.js';
import AddButton from '../../components/buttons/AddButton.jsx';
import ClearAllButton from '../../components/buttons/ClearAllButton.jsx';
import FilterButton from '../../components/buttons/FilterButton.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import { BoxIcon, CategoriesIcon, CheckCircleIcon, ChevronRightIcon, XCircleIcon } from '../../components/common/Icons.jsx';
import LoadingState from '../../components/common/LoadingState.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import SearchInput from '../../components/common/SearchInput.jsx';
import CategoryFilter from '../../components/filters/CategoryFilter.jsx';
import PriceRangeFilter from '../../components/filters/PriceRangeFilter.jsx';
import StatusFilter from '../../components/filters/StatusFilter.jsx';
import ConfirmationModal from '../../components/modals/ConfirmationModal.jsx';
import SuccessModal from '../../components/modals/SuccessModal.jsx';
import ProductTable from './ProductTable.jsx';
import { productImage } from '../../utils/formatImage.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useResource } from '../../hooks/useResource.js';
import MainLayout from '../../layout/MainLayout.jsx';
import ProductDetails from './ProductDetails.jsx';
import ProductForm from './ProductForm.jsx';
import { PAGE_SIZE, STATUS_QUERY } from './menuFormat.js';

const NO_FILTERS = { status: '', category: '', price: '' };

const HEADERS = {
  list: ['Menu Management', 'Manage your food, drinks, and inventory items easily.'],
  add: ['Add Menu Item', 'Fill in the details to add a new food or drink to your menu.'],
  edit: ['Edit Menu Item', 'Change the details to the food or drink to your menu.'],
  details: [
    <>Menu Management <ChevronRightIcon size={22} className="title-sep" /> View Product</>,
    'View the product details.',
  ],
};

function SummaryCard({ tone, Icon, label, value }) {
  return (
    <div className={`stat stat--${tone}`}>
      <span className="stat__icon"><Icon size={24} /></span>
      <div>
        <div className="stat__label">{label}</div>
        <div className="stat__value">{value}</div>
      </div>
    </div>
  );
}

// Products, categories, ingredients and discount definitions are stored by the Menu Service (through the Gateway).
export default function ProductManagement() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { pathname } = useLocation();
  const screen = pathname === '/menu/products/new' ? { name: 'add' }
    : pathname.endsWith('/edit') ? { name: 'edit', id }
      : id ? { name: 'details', id } : { name: 'list' };
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(null);
  const [ingredientEdit, setIngredientEdit] = useState(null); // { ingredient, quantity }
  const [toast, setToast] = useState(null);
  const [problem, setProblem] = useState('');

  const showToast = (title, message) => setToast({ id: Date.now(), title, message });
  const closeToast = useCallback(() => setToast(null), []);

  const categoriesLoad = useResource((signal) => categoryApi.listCategories(signal));
  const discountsLoad = useResource((signal) => discountApi.listDiscounts(signal));
  const ingredientsLoad = useResource((signal) => ingredientApi.searchIngredients('', signal));
  const summaryLoad = useResource((signal) => productApi.productSummary(signal));
  const categories = categoriesLoad.data ?? [];
  const discounts = discountsLoad.data ?? [];
  const categoryId = categories.find((c) => c.name === filters.category)?.id;

  const list = useResource((signal) => productApi.listProducts({
    search, status: STATUS_QUERY[filters.status], categoryId, sort: filters.price ? `price_${filters.price}` : undefined, page, limit: PAGE_SIZE,
  }, signal), [search, filters.status, categoryId, filters.price, page]);
  const detail = useResource((signal) => (screen.id ? productApi.getProduct(screen.id, signal) : Promise.resolve(null)), [screen.id]);
  const current = screen.id ? detail.data : null;

  const totalPages = list.data?.meta?.totalPages ?? 1;
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]); // the last page emptied by a delete

  const reloadAll = () => { list.reload(); summaryLoad.reload(); ingredientsLoad.reload(); };
  const updateQuery = (value) => { setQuery(value); setPage(1); };
  const updateFilter = (key) => (value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };
  const clearFilters = () => { setFilters(NO_FILTERS); setPage(1); };

  const toList = () => { setProblem(''); navigate('/menu'); };
  const toDetails = (productId) => navigate(`/menu/products/${productId}`);

  // The form speaks names; the API wants ids.
  const bodyOf = (data) => ({
    name: data.name,
    categoryId: categories.find((c) => c.name === data.category)?.id,
    costPrice: data.costPrice,
    sellingPrice: data.sellingPrice,
    quantity: data.quantity,
    lowStockAlert: data.lowStockAlert,
    discountId: data.discountType ? discounts.find((d) => d.name === data.discountType)?.id : undefined,
    ingredients: data.ingredients.map(({ name, quantity }) => ({ name, quantity })),
  });
  // A failed picture upload does not undo the saved product; it is reported in the message.
  const uploadPicture = async (id, file) => {
    if (!file) return '';
    try { await productApi.uploadProductImage(id, file); return ''; } catch (err) { return ` The picture was not saved: ${messageFor(err)}`; }
  };

  const saveNew = async (data) => {
    const result = await attempt(() => productApi.createProduct(bodyOf(data)));
    if (!result.ok) return result;
    const note = await uploadPicture(result.data.id, data.imageFile);
    reloadAll();
    setPage(1);
    toList();
    showToast('Product Added Successfully!', `The product has been added and is now available in the shop.${note}`);
    return result;
  };

  const saveEdit = async (data) => {
    const result = await attempt(() => productApi.updateProduct(screen.id, bodyOf(data)));
    if (!result.ok) return result;
    const note = await uploadPicture(screen.id, data.imageFile);
    reloadAll();
    detail.reload();
    toDetails(screen.id);
    showToast('Product Updated Successfully!', `The product has been updated and is now available in the shop.${note}`);
    return result;
  };

  const confirmDelete = async () => {
    const target = deleting;
    setDeleting(null);
    const result = await attempt(() => productApi.deleteProduct(target.id));
    if (!result.ok) { setProblem(result.error); return; }
    setProblem('');
    reloadAll();
    showToast('Product Deleted Successfully', 'This item has been removed and cannot be restored.');
  };

  const confirmIngredient = async () => {
    const { ingredient, quantity } = ingredientEdit;
    setIngredientEdit(null);
    if (!quantity.trim()) return; // nothing typed: keep the quantity
    const result = await attempt(() => productApi.setIngredientQuantity(current.id, ingredient.id, quantity.trim()));
    if (!result.ok) { setProblem(result.error); return; }
    setProblem('');
    detail.reload();
    showToast('Product Ingredient Updated Successfully !', 'The ingredient details have been updated.');
  };

  const addCategory = async (name) => {
    const result = await attempt(() => categoryApi.createCategory(name));
    if (result.ok) categoriesLoad.setData((list) => [...(list ?? []), result.data]); // at once: Save may be pressed before any reload
    return result;
  };
  const addDiscount = async (discount) => {
    const result = await attempt(() => discountApi.createDiscount(discount));
    if (result.ok) discountsLoad.setData((list) => [...(list ?? []), result.data]);
    return result;
  };

  const [title, subtitle] = HEADERS[screen.name];
  const formProps = {
    categories: categories.map((c) => c.name), discounts, ingredientOptions: ingredientsLoad.data ?? [], onAddCategory: addCategory, onAddDiscount: addDiscount,
  };
  const summary = summaryLoad.data;

  return (
    <MainLayout title={title} subtitle={subtitle} active="Menu Management">
      {screen.name === 'list' && (
        <>
          <section className="panel stats">
            <SummaryCard tone="green" Icon={BoxIcon} label="Total Items" value={summary?.total ?? '–'} />
            <SummaryCard tone="green" Icon={CheckCircleIcon} label="Active Items" value={summary?.active ?? '–'} />
            <SummaryCard tone="red" Icon={XCircleIcon} label="Out of Stock" value={summary?.outOfStock ?? '–'} />
            <SummaryCard tone="purple" Icon={CategoriesIcon} label="Categories" value={summary?.categories ?? '–'} />
          </section>

          <section className="panel products">
            <div className="toolbar">
              <SearchInput value={query} onChange={updateQuery} placeholder="Search product name, product id , category and status" />
              <FilterButton open={filterOpen} onClick={() => setFilterOpen(!filterOpen)} />
              <AddButton label="Add Product" onClick={() => navigate('/menu/products/new')} />
            </div>

            {filterOpen && (
              <div className="filters">
                <StatusFilter value={filters.status} onChange={updateFilter('status')} />
                <CategoryFilter value={filters.category} categories={categories.map((c) => c.name)} onChange={updateFilter('category')} />
                <PriceRangeFilter value={filters.price} onChange={updateFilter('price')} />
                <ClearAllButton onClick={clearFilters} />
              </div>
            )}

            {problem && <ErrorState message={problem} />}
            {list.loading && !list.data && <LoadingState message="Loading products..." />}
            {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
            {list.data && (
              <ProductTable products={list.data.data}
                onView={(p) => toDetails(p.id)}
                onEdit={(p) => navigate(`/menu/products/${p.id}/edit`)}
                onDelete={setDeleting} />
            )}
          </section>

          {list.data && <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.meta.total} onChange={setPage} />}
        </>
      )}

      {screen.name === 'add' && <ProductForm mode="add" {...formProps} onCancel={toList} onSave={saveNew} />}

      {(screen.name === 'edit' || screen.name === 'details') && detail.loading && !current && <LoadingState message="Loading the product..." />}
      {(screen.name === 'edit' || screen.name === 'details') && detail.error && <ErrorState message={detail.error} onRetry={detail.reload} />}

      {screen.name === 'edit' && current && (
        <ProductForm key={current.id} mode="edit" product={current} {...formProps}
          onCancel={() => toDetails(current.id)} onSave={saveEdit} />
      )}

      {screen.name === 'details' && current && (
        <>
          {problem && <ErrorState message={problem} />}
          <ProductDetails product={current} onBack={toList}
            onEdit={() => navigate(`/menu/products/${current.id}/edit`)}
            onEditIngredient={(ingredient) => setIngredientEdit({ ingredient, quantity: '' })} />
        </>
      )}

      {deleting && (
        <ConfirmationModal message='Click "Delete" to remove this item.' confirmLabel="Delete"
          onCancel={() => setDeleting(null)} onConfirm={confirmDelete}>
          <div className="modal__product"><img src={productImage(deleting.image)} alt="" />{deleting.name}</div>
        </ConfirmationModal>
      )}

      {ingredientEdit && (
        <ConfirmationModal message="Confirm to update the ingredient." confirmLabel="Update" className="modal--ingredient"
          onCancel={() => setIngredientEdit(null)} onConfirm={confirmIngredient}>
          <div className="modal__fields">
            <div className="field">
              <span className="field-label">Ingredient Name</span>
              <span className="modal__static">{ingredientEdit.ingredient.name}</span>
            </div>
            <label className="field">
              <span className="field-label">Quantity</span>
              <input className="input" autoFocus value={ingredientEdit.quantity} placeholder={ingredientEdit.ingredient.quantity}
                onChange={(e) => setIngredientEdit((s) => ({ ...s, quantity: e.target.value }))} />
            </label>
          </div>
        </ConfirmationModal>
      )}

      {toast && <SuccessModal key={toast.id} title={toast.title} message={toast.message} onClose={closeToast} />}
    </MainLayout>
  );
}
