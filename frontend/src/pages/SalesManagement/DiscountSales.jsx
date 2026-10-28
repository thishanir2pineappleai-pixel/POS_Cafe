import CancelButton from '../../components/buttons/CancelButton.jsx';
import Dropdown from '../../components/common/Dropdown.jsx';
import { ArrowRightIcon, CalendarIcon, PlusIcon } from '../../components/common/Icons.jsx';
import { ModalShell } from '../../components/modals/ConfirmationModal.jsx';
import { formatLong } from '../../utils/formatDate.js';

// "Select Discount" (apply) / "Update Discount" (edit) dialog: pick a discount, then set its period.
export default function DiscountSales({ mode, draft, defs, errors, onChange, onAddDiscount, onPickDates, onNext, onCancel }) {
  const update = mode === 'update';
  const def = defs.find((d) => d.name === draft.name);
  const options = [{ value: '', label: 'Select Discount' }, ...defs.map((d) => ({ value: d.name, label: d.name }))];

  const dateField = (label, date) => (
    <div className="field">
      <span className="field-label">{label}</span>
      <button type="button" className={`date-field${errors.dates ? ' has-error' : ''}`} onClick={onPickDates}>
        <CalendarIcon size={16} />
        <span className={date ? '' : 'is-placeholder'}>{date ? formatLong(date) : 'DD/MM/YYYY'}</span>
      </button>
    </div>
  );

  return (
    <ModalShell className="modal--wide">
      <div className="modal__titlebar">
        <div>
          <h2 className="modal__title">{update ? 'Update Discount' : 'Select Discount'}</h2>
          <p className="modal__sub">Choose a discount and set the period</p>
        </div>
        {update && (
          <div className="status-toggle">
            <span>Status</span>
            <button type="button" role="switch" aria-checked={draft.status === 'Active'} className="switch"
              onClick={() => onChange({ status: draft.status === 'Active' ? 'Inactive' : 'Active' })} aria-label="Status" />
            <span className="status-toggle__label">{draft.status}</span>
          </div>
        )}
      </div>

      <div className="field">
        <span className="field-label">Select Discount</span>
        <div className="select-row">
          <Dropdown className={`dropdown--tz${errors.name ? ' has-error' : ''}`} triangle value={draft.name} options={options}
            placeholder="Select Discount" onChange={(name) => onChange({ name })} />
          <button type="button" className="square-add" onClick={onAddDiscount} aria-label="Add discount"><PlusIcon size={18} /></button>
        </div>
        {errors.name && <span className="field-error">{errors.name}</span>}
      </div>

      {def && (
        <div className="field">
          <span className="field-label">Discount Details</span>
          <div className="details-table">
            <div className="details-table__row details-table__head"><span>Name</span><span>Type</span><span>Value</span></div>
            <div className="details-table__row"><span>{def.name}</span><span>Percentage</span><span>{def.value} %</span></div>
          </div>
        </div>
      )}

      <div className="range-row">
        {dateField('Start Date', draft.start)}
        <ArrowRightIcon size={14} className="date-arrow" />
        {dateField('End Date', draft.end)}
      </div>
      {errors.dates && <span className="field-error">{errors.dates}</span>}

      <div className="modal__actions modal__actions--wide">
        <CancelButton onClick={onCancel} />
        <button type="button" className="btn btn-primary btn-next" onClick={onNext}>
          Next: Select Products<ArrowRightIcon size={16} />
        </button>
      </div>
    </ModalShell>
  );
}
