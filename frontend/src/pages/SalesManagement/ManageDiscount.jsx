import { useCallback, useEffect, useMemo, useState } from 'react';
import * as discountApi from '../../api/discountApi.js';
import { attempt } from '../../api/errorHandler.js';
import { productImage } from '../../utils/formatImage.js';
import * as productApi from '../../api/productApi.js';
import * as salesApi from '../../api/salesApi.js';
import DeleteButton from '../../components/buttons/DeleteButton.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import { ArrowLeftIcon, ArrowRightIcon, EditIcon, TicketIcon } from '../../components/common/Icons.jsx';
import LoadingState from '../../components/common/LoadingState.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import SearchInput from '../../components/common/SearchInput.jsx';
import DateRangePicker from '../../components/filters/DateRangePicker.jsx';
import AddDiscountModal from '../../components/modals/AddDiscountModal.jsx';
import ConfirmationModal, { ModalHeader, ModalShell } from '../../components/modals/ConfirmationModal.jsx';
import SuccessModal from '../../components/modals/SuccessModal.jsx';
import { formatDots, fromISO, toISO } from '../../utils/formatDate.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useResource } from '../../hooks/useResource.js';
import { validateDiscountDraft, validateProductSelection } from '../../validation/discountValidation.js';
import DiscountSales from './DiscountSales.jsx';
import SelectProductsSales from './SelectProductsSales.jsx';
import { DISCOUNTS_PAGE_SIZE, appliesLabel, toDiscountRow } from './salesFormat.js';

const COLUMNS = ['Discount Name', 'Type', 'Value', 'Applies To', 'Period', 'Status', 'Action'];
const COLS = '1.3fr 1fr .8fr 1.1fr 1.9fr .9fr .9fr';
const BLANK_DRAFT = { id: null, name: '', start: null, end: null, status: 'Active', original: null };

const ADDED = ['Discount Added successfully', 'The new discount has been added, you can apply to the products.'];
const UPDATED = ['Discount Updated successfully', 'The new discount has been added, you can apply to the products.'];

// Discount applications are stored by the Sales Service; the discount definitions (name, percentage) and the products come
// from the Menu Service (through the Gateway). Deleting an application is for the owner only (the server enforces it).
export default function ManageDiscount({ onBack, today }) {
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const [page, setPage] = useState(1);
  // flow: { kind: 'apply' | 'update', step: 'select' | 'status' | 'products' | 'confirm', draft, selection }
  const [flow, setFlow] = useState(null);
  const [errors, setErrors] = useState({});
  const [productError, setProductError] = useState('');
  const [pickingDates, setPickingDates] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState(null);
  const [problem, setProblem] = useState('');

  const applications = useResource((signal) => salesApi.listApplications({ search, page, limit: DISCOUNTS_PAGE_SIZE }, signal), [search, page]);
  const defsLoad = useResource((signal) => discountApi.listDiscounts(signal));
  const productsLoad = useResource((signal) => productApi.listAllProducts(signal));
  const defs = useMemo(() => (defsLoad.data ?? []).map((d) => ({ id: d.id, name: d.name, value: d.percentage })), [defsLoad.data]);
  const products = useMemo(() => (productsLoad.data ?? []).map((p) => ({ id: p.id, name: p.name, category: p.category, sellingPrice: p.sellingPrice, image: productImage(p.image) })), [productsLoad.data]);
  const rows = (applications.data?.data ?? []).map(toDiscountRow);

  const totalPages = applications.data?.meta?.totalPages ?? 1;
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const showToast = ([title, message]) => setToast({ id: Date.now(), title, message });
  const closeToast = useCallback(() => setToast(null), []);

  const patchDraft = (patch) => { setFlow((f) => ({ ...f, draft: { ...f.draft, ...patch } })); setErrors({}); };
  const setStep = (step) => setFlow((f) => ({ ...f, step }));
  const close = () => { setFlow(null); setErrors({}); setProductError(''); setPickingDates(false); setAdding(false); };

  const openApply = () => setFlow({ kind: 'apply', step: 'select', draft: BLANK_DRAFT, selection: { mode: null, productIds: [] } });
  const openUpdate = (d) => setFlow({
    kind: 'update',
    step: 'select',
    draft: { id: d.id, name: d.name, start: fromISO(d.start), end: fromISO(d.end), status: d.status, original: d.status },
    selection: { mode: d.productIds === null ? 'all' : 'selected', productIds: d.productIds ?? [] },
  });

  // productIds === null means "All Products".
  const bodyOf = (draft, productIds) => ({
    discountId: defs.find((x) => x.name === draft.name)?.id,
    startDate: toISO(draft.start),
    endDate: toISO(draft.end),
    status: draft.status,
    appliesToAll: productIds === null,
    ...(productIds === null ? {} : { productIds }),
  });
  const save = (draft, productIds) => attempt(() => (draft.id ? salesApi.updateApplication(draft.id, bodyOf(draft, productIds)) : salesApi.createApplication(bodyOf(draft, productIds))));

  const next = () => {
    const found = validateDiscountDraft(flow.draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    setStep(flow.kind === 'update' && flow.draft.status !== flow.draft.original ? 'status' : 'products');
  };

  // "Save" in the status dialog: store the new status/period but keep the existing products.
  const saveStatusOnly = async () => {
    const { draft } = flow;
    const existing = rows.find((d) => d.id === draft.id);
    const result = await save(draft, existing ? existing.productIds : null);
    if (!result.ok) { setErrors({ name: result.error }); setStep('select'); return; }
    applications.reload();
    close();
    showToast(draft.status === 'Inactive'
      ? ['Discount inactivated successfully', 'This discount cannot be apply for new orders.']
      : ['Discount reactivated successfully', 'This discount can be apply for new orders.']);
  };

  const applyProducts = () => {
    const err = validateProductSelection(flow.selection);
    setProductError(err);
    if (!err) setStep('confirm');
  };

  const commit = async () => {
    const { kind, draft, selection } = flow;
    const result = await save(draft, selection.mode === 'all' ? null : selection.productIds);
    if (!result.ok) { setProductError(result.error); setStep('products'); return; } // the refusal is shown where the choice was made
    applications.reload();
    if (kind === 'apply') setPage(1);
    close();
    showToast(kind === 'apply' ? ADDED : UPDATED);
  };

  const confirmDelete = async () => {
    const target = deleting;
    setDeleting(null);
    const result = await attempt(() => salesApi.deleteApplication(target.id));
    if (!result.ok) { setProblem(result.error); return; }
    setProblem('');
    applications.reload();
    showToast(['Discount deleted successfully', 'This discount has been removed and cannot be restored.']);
  };

  const addDefinition = async ({ name, percentage }) => {
    const result = await attempt(() => discountApi.createDiscount({ name, percentage }));
    if (!result.ok) return result;
    defsLoad.setData((list) => [...(list ?? []), result.data]); // at once: "Next" may be pressed before any reload
    patchDraft({ name });
    setAdding(false);
    return result;
  };

  const becomingInactive = flow?.draft.status === 'Inactive';

  return (
    <>
      <section className="panel discounts">
        <div className="discounts__top">
          <button type="button" className="btn btn-outline" onClick={onBack}><ArrowLeftIcon size={16} />Back</button>
          <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search Discount" />
          <button type="button" className="btn btn-primary btn-apply" onClick={openApply}><TicketIcon size={18} />Apply Discount</button>
        </div>

        {problem && <ErrorState message={problem} />}
        {applications.loading && !applications.data && <LoadingState message="Loading discounts..." />}
        {applications.error && <ErrorState message={applications.error} onRetry={applications.reload} />}
        {applications.data && (
          <div className="gtable" style={{ '--cols': COLS }}>
            <div className="gtable__inner">
              <div className="gtable__row gtable__head">{COLUMNS.map((c) => <span key={c}>{c}</span>)}</div>
              {rows.length === 0 && <EmptyState message="No discounts found" />}
              {rows.map((d) => (
                <div className="gtable__row" key={d.id}>
                  <span className="b">{d.name}</span>
                  <span>Percentage</span>
                  <span>{d.value} %</span>
                  <span>{appliesLabel(d)}</span>
                  <span>{formatDots(fromISO(d.start))} - {formatDots(fromISO(d.end))}</span>
                  <span><span className={`badge badge--${d.status.toLowerCase()}`}>{d.status}</span></span>
                  <span className="ptable__actions">
                    <button type="button" className="icon-btn icon-btn--orange" onClick={() => openUpdate(d)} aria-label={`Edit ${d.name}`} title="Edit"><EditIcon size={15} /></button>
                    <DeleteButton onClick={() => setDeleting(d)} label={`Delete ${d.name}`} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      {applications.data && <Pagination page={page} pageSize={DISCOUNTS_PAGE_SIZE} total={applications.data.meta.total} onChange={setPage} label="discounts" />}

      {flow?.step === 'select' && (
        <DiscountSales mode={flow.kind} draft={flow.draft} defs={defs} errors={errors} onChange={patchDraft}
          onAddDiscount={() => setAdding(true)} onPickDates={() => setPickingDates(true)} onNext={next} onCancel={close} />
      )}

      {flow?.step === 'status' && (
        <ModalShell className="modal--status">
          <ModalHeader title={becomingInactive ? 'Confirm inactivate this discount.' : 'Confirm Reactivate this discount.'} onClose={close} />
          <p className="modal__desc">
            {becomingInactive
              ? 'This discount will be marked as Inactive and will no longer apply to new orders. You can reactivate it at any time.'
              : 'This discount will be marked as Active and will apply to new orders. You can deactivate it at any time.'}
          </p>
          <div className="modal__actions modal__actions--status">
            <button type="button" className="btn btn-outline-green btn-wide" onClick={saveStatusOnly}>Save</button>
            <button type="button" className="btn btn-primary btn-wide" onClick={() => setStep('products')}>Save &amp; Continue<ArrowRightIcon size={16} /></button>
          </div>
        </ModalShell>
      )}

      {flow?.step === 'products' && (
        <SelectProductsSales title={flow.kind === 'update' ? 'Update Product' : 'Select Product'} products={products}
          selection={flow.selection} error={productError}
          onChange={(selection) => { setFlow((f) => ({ ...f, selection })); setProductError(''); }}
          onApply={applyProducts} onCancel={close} />
      )}

      {flow?.step === 'confirm' && (
        <ConfirmationModal
          message={flow.kind === 'update' ? "Click 'Save Changes' to update discount details." : "Click 'Save' to apply discount."}
          confirmLabel={flow.kind === 'update' ? 'Save Changes' : 'Save'} onCancel={close} onConfirm={commit} />
      )}

      {pickingDates && (
        <DateRangePicker start={flow.draft.start} end={flow.draft.end} today={today} onCancel={() => setPickingDates(false)}
          onApply={({ start, end }) => { patchDraft({ start, end }); setPickingDates(false); }} />
      )}

      {adding && <AddDiscountModal onClose={() => setAdding(false)} onSave={addDefinition} />}

      {deleting && (
        <ConfirmationModal message='Click "Delete" to remove this discount.' confirmLabel="Delete" onCancel={() => setDeleting(null)} onConfirm={confirmDelete}>
          <div className="modal__line">{deleting.name} : {deleting.value} %</div>
        </ConfirmationModal>
      )}

      {toast && <SuccessModal key={toast.id} title={toast.title} message={toast.message} onClose={closeToast} />}
    </>
  );
}
