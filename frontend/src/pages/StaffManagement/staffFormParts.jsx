import { useRef, useState } from 'react';
import Dropdown from '../../components/common/Dropdown.jsx';
import FormField from '../../components/common/FormField.jsx';
import { CalendarIcon, FileTextIcon, TrashIcon, UploadCloudIcon, UploadIcon } from '../../components/common/Icons.jsx';
import StatusToggle from '../../components/common/StatusToggle.jsx';
import PasswordInput from '../../components/common/PasswordInput.jsx';
import { documentFileProblem } from '../../validation/staffValidation.js';

// Shared by the Add Staff steps and the Edit Staff section dialogs, so a field looks and validates the same in both.
// Values are nested objects; errors are keyed by dotted path ('emergency.name', 'salary.basic').
export const getIn = (obj, path) => path.split('.').reduce((v, k) => v?.[k], obj);
export const setIn = (obj, path, value) => {
  const [key, ...rest] = path.split('.');
  return { ...obj, [key]: rest.length ? setIn(obj[key], rest.join('.'), value) : value };
};

export const options = (list) => list.map((v) => ({ value: v, label: v }));
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const megabytes = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))}KB` : `${Number((bytes / 1024 / 1024).toFixed(1))}MB`);

export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  // Changing a field clears only that field's error.
  const set = (path, value) => {
    setValues((v) => setIn(v, path, value));
    setErrors((e) => (e[path] ? { ...e, [path]: undefined } : e));
  };
  return { values, errors, set, setErrors };
}

// Builds the field controls for one form. Each returns a labelled control; the caller decides the layout.
export function fieldKit({ values, errors, set }) {
  const bad = (path) => (errors[path] ? ' has-error' : '');
  const value = (path) => getIn(values, path) ?? '';
  return {
    text: (path, label, placeholder, className = '') => (
      <FormField label={label} error={errors[path]} className={className}>
        <input className={`input${bad(path)}`} value={value(path)} placeholder={placeholder} onChange={(e) => set(path, e.target.value)} />
      </FormField>
    ),
    area: (path, label, placeholder, className = '') => (
      <FormField label={label} error={errors[path]} className={className}>
        <textarea className={`input input--area${bad(path)}`} rows={3} value={value(path)} placeholder={placeholder}
          onChange={(e) => set(path, e.target.value)} />
      </FormField>
    ),
    date: (path, label) => (
      <FormField label={label} error={errors[path]}>
        <span className="date-wrap">
          <CalendarIcon size={15} />
          <input className={`input${bad(path)}`} value={value(path)} placeholder="DD/MM/YYYY" inputMode="numeric" maxLength={10}
            onChange={(e) => set(path, e.target.value)} />
        </span>
      </FormField>
    ),
    money: (path, label, placeholder) => (
      <FormField label={label} error={errors[path]}>
        <input className={`input${bad(path)}`} inputMode="decimal" value={value(path)} placeholder={placeholder}
          onChange={(e) => set(path, e.target.value)} />
      </FormField>
    ),
    pick: (path, label, list, placeholder, className = '') => (
      <FormField label={label} error={errors[path]} className={className}>
        <Dropdown className={`dropdown--green${bad(path)}`} value={value(path)} options={options(list)} placeholder={placeholder}
          onChange={(v) => set(path, v)} />
      </FormField>
    ),
    password: (path, label, placeholder) => (
      <FormField label={label} error={errors[path]}>
        <PasswordInput invalid={Boolean(errors[path])} value={value(path)} placeholder={placeholder} onChange={(e) => set(path, e.target.value)} />
      </FormField>
    ),
    // One of several buttons (Salary Type, Working Days). `multi` toggles membership of an array instead of picking one.
    segment: (path, label, list, { multi = false, error } = {}) => (
      <div className="field">
        <span className="field-label">{label}</span>
        <div className="seg-row" role="group" aria-label={label}>
          {list.map((item) => {
            const on = multi ? value(path).includes(item) : value(path) === item;
            const click = () => set(path, multi ? (on ? value(path).filter((x) => x !== item) : [...value(path), item]) : item);
            return (
              <button type="button" key={item} className={`seg-pill${on ? ' is-on' : ''}${multi ? ' seg-pill--day' : ''}`} aria-pressed={on} onClick={click}>
                {item}
              </button>
            );
          })}
        </div>
        {(error ?? errors[path]) && <span className="field-error">{error ?? errors[path]}</span>}
      </div>
    ),
    toggle: (path, label, onText, offText) => (
      <div className="field">
        <span className="field-label">{label}</span>
        <StatusToggle checked={Boolean(value(path))} label={value(path) ? onText : offText} onChange={(v) => set(path, v)} />
      </div>
    ),
  };
}

// "Staff Image" row of Add Staff Step 1: looks like an input until a picture is chosen, then shows its name and size.
export function StaffImageField({ form }) {
  const { values, set } = form;
  const [problem, setProblem] = useState('');
  const ref = useRef(null);
  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type) || file.size > MAX_IMAGE_BYTES) { setProblem('Only JPG or PNG files up to 2MB are allowed'); return; }
    setProblem('');
    set('avatar', URL.createObjectURL(file)); // ponytail: object URLs are never revoked; they are small and live for one page visit
    set('avatarFile', file); // the File is uploaded after the staff record is saved
    set('imageName', `${file.name}  ${megabytes(file.size)}`);
  };
  const remove = () => { set('avatar', null); set('avatarFile', null); set('imageName', ''); };

  return (
    <div className="field">
      <span className="field-label">Staff Image</span>
      <input ref={ref} type="file" accept="image/jpeg,image/png" hidden onChange={onFile} />
      {values.avatar ? (
        <span className="input file-chip">
          <img src={values.avatar} alt="" />
          <span className="file-chip__name">{values.imageName}</span>
          <button type="button" className="file-chip__remove" onClick={remove} aria-label="Remove image"><TrashIcon size={14} /></button>
        </span>
      ) : (
        <button type="button" className={`input input-select is-placeholder${problem ? ' has-error' : ''}`} onClick={() => ref.current?.click()}>
          <span>Upload Staff Image</span>
          <UploadIcon size={15} />
        </button>
      )}
      {problem ? <span className="field-error">{problem}</span> : <small className="upload__hint">Upload an Image (JPG, PNG, max 2MB)</small>}
    </div>
  );
}

// Reads a picked document; reports a type or size problem instead of accepting it.
function pickDocument(slotKey, e, onPick, onProblem) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  const problem = documentFileProblem(slotKey, file);
  onProblem(problem);
  if (!problem) onPick({ name: file.name, size: file.size, url: URL.createObjectURL(file), file }); // `file` is uploaded when the record is saved
}

// Dashed upload box of Add Staff Step 3. The chosen file is kept until the staff record is saved, then uploaded.
export function DocumentBox({ slot, value, error, onPick }) {
  const ref = useRef(null);
  const [problem, setProblem] = useState('');
  const shown = problem || error;
  return (
    <div className="field">
      <span className="field-label">{slot.label}</span>
      <input ref={ref} type="file" accept={slot.accept} hidden onChange={(e) => pickDocument(slot.key, e, onPick, setProblem)} />
      {value ? (
        <div className="doc-box doc-box--filled">
          <span className="doc-box__file"><FileTextIcon size={13} />{value.name}</span>
          <small>{megabytes(value.size)} · Uploaded</small>
          <button type="button" className="link-btn doc-box__change" onClick={() => ref.current?.click()}>Change File</button>
        </div>
      ) : (
        <button type="button" className={`doc-box${shown ? ' has-error' : ''}`} onClick={() => ref.current?.click()}>
          <UploadCloudIcon size={22} />
          <strong>Upload {slot.label}</strong>
          <small>{slot.hint}</small>
        </button>
      )}
      {shown && <span className="field-error">{shown}</span>}
    </div>
  );
}

// One row of the Edit Documents dialog.
export function DocumentRow({ slot, value, onPick, onRemove }) {
  const ref = useRef(null);
  const [problem, setProblem] = useState('');
  return (
    <div className="doc-row">
      <span className="field-label">{slot.viewLabel}</span>
      <div>
        <input ref={ref} type="file" accept={slot.accept} hidden onChange={(e) => pickDocument(slot.key, e, onPick, setProblem)} />
        {value ? (
          <span className="input file-chip">
            <FileTextIcon size={13} />
            <span className="file-chip__name">{value.name} <small>{megabytes(value.size)}</small></span>
            <button type="button" className="file-chip__remove" onClick={onRemove} aria-label={`Remove ${slot.viewLabel}`}><TrashIcon size={14} /></button>
          </span>
        ) : (
          <button type="button" className={`input input-select is-placeholder${problem ? ' has-error' : ''}`} onClick={() => ref.current?.click()}>
            <span>{slot.hint}</span>
            <UploadIcon size={15} />
          </button>
        )}
        {problem && <span className="field-error">{problem}</span>}
      </div>
    </div>
  );
}

// Salary & Payroll fields (Add Step 3 and the Edit dialog). Overtime and bank fields appear only when they apply.
export function SalaryFields({ kit, values }) {
  const { salary } = values;
  return (
    <>
      {kit.segment('salary.type', 'Salary Type', ['Monthly', 'Daily', 'Hourly'])}
      {kit.money('salary.basic', 'Basic Salary', 'eg : 60,000.00')}
      {kit.toggle('salary.overtime', 'Overtime', 'Allowed', 'Not Allowed')}
      {salary.overtime ? kit.money('salary.otRate', 'OT Salary Per Hour', 'eg : 100.00') : <span />}
      {kit.pick('salary.method', 'Payment Method', ['Cash', 'Bank Transfer'], 'eg: Bank Transer')}
      {salary.method !== 'Cash' && (
        <>
          {kit.text('salary.bank', 'Bank Name (with Branch)', 'eg: BOC - Jaffna')}
          {kit.text('salary.account', 'Account Number', 'Eg: 0000-0000-0000')}
        </>
      )}
    </>
  );
}

export function EpfFields({ kit, values, withRates = false }) {
  return (
    <>
      {kit.toggle('epf.allowed', 'EPF/ETF', 'Allowed', 'Not Allowed')}
      {values.epf.allowed && (
        <>
          {kit.text('epf.employerNumber', 'Employer Number', 'eg: 123456/A')}
          {kit.text('epf.employeeNumber', 'Employee Number', 'eg: 00789')}
          {withRates && (
            <>
              {kit.text('epf.employeeRate', 'Employee EPF Rate', '8')}
              {kit.text('epf.employerRate', 'Employer EPF Rate', '12')}
              {kit.text('epf.etfRate', 'Employer ETF Rate', '3')}
            </>
          )}
        </>
      )}
    </>
  );
}

export const EPF_NOTE = 'Note : EPF & ETF is mandatory for eligible employees as per Sri Lankan Labour Law (EPF Act No 15 of 1958 and ETF Act No 46 of 1980).';