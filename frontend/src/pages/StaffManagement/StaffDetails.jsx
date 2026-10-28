import { useRef, useState } from 'react';
import CancelButton from '../../components/buttons/CancelButton.jsx';
import SaveButton from '../../components/buttons/SaveButton.jsx';
import { CameraIcon, CloseIcon, EditSquareIcon } from '../../components/common/Icons.jsx';
import StatusToggle from '../../components/common/StatusToggle.jsx';
import ConfirmationModal, { ModalHeader, ModalShell } from '../../components/modals/ConfirmationModal.jsx';
import {
  validateEmergency, validateEmployment, validateEpf, validatePersonal, validateSalary,
} from '../../validation/staffValidation.js';
import * as staffApi from '../../api/staffApi.js';
import { attempt } from '../../api/errorHandler.js';
import { ShiftBadge, StaffPhoto, StatusBadge, useStaffPicture } from './StaffBadges.jsx';
import { DocumentRow, EpfFields, SalaryFields, fieldKit, useForm } from './staffFormParts.jsx';
import { DOCUMENT_SLOTS, GENDERS, formatMoney, staffTag } from './staffConstants.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const dash = (v) => (v === '' || v === null || v === undefined ? '-' : v);
const money = (v) => (v === '' || v === null || v === undefined ? '-' : formatMoney(v));

function Card({ title, onEdit, className = '', children }) {
  return (
    <section className={`panel sd-card ${className}`}>
      {title && <div className="sd-card__head"><h2>{title}</h2></div>}
      {onEdit && (
        <button type="button" className="sd-card__edit" onClick={onEdit} aria-label={`Edit ${title ?? 'Employment Details'}`}><EditSquareIcon size={15} /></button>
      )}
      {children}
    </section>
  );
}

function Rows({ rows }) {
  return (
    <dl className="sd-rows">
      {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

// Keeps only the errors of the fields a dialog actually shows.
const only = (errors, keys) => Object.fromEntries(Object.entries(errors).filter(([k]) => keys.includes(k)));

// Edit dialog: its own copy of the values, applied to the staff draft only when it validates and Save Changes is pressed.
function SectionDialog({ title, initial, check, onClose, onApply, children }) {
  const form = useForm(initial);
  const kit = fieldKit(form);
  const save = () => {
    const found = check(form.values);
    form.setErrors(found);
    if (Object.keys(found).length === 0) onApply(form.values);
  };
  return (
    <ModalShell className="modal--section" onClose={onClose}>
      <ModalHeader title={title} onClose={onClose} />
      <div className="modal__body sf-rows">{children(kit, form)}</div>
      <div className="modal__actions modal__actions--section">
        <CancelButton onClick={onClose} />
        <SaveButton label="Save Changes" onClick={save} />
      </div>
    </ModalShell>
  );
}

// View Staff and Edit Staff share this page. Edit changes a draft through the dialogs; onSave(draft) saves it with the Staff
// Service on the final save and resolves to { ok, error? }. Salary, EPF/ETF and documents are the owner's (`isOwner`).
// `lists` holds the names of the roles, teams and shifts that exist.
export default function StaffDetails({ staff, lists, isOwner, editing, onClose, onEdit, onCancelEdit, onSave }) {
  const [draft, setDraft] = useState(staff);
  const [dialog, setDialog] = useState(null); // employment | personal | emergency | salary | epf | documents
  const [reasonAsk, setReasonAsk] = useState(null); // null, or { text, error } while turning the staff inactive
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const photoInput = useRef(null);

  const shown = editing ? draft : staff;
  const picture = useStaffPicture(shown);
  const apply = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDialog(null); };
  // A document already on the server is fetched with the token; one just chosen in the dialog is opened from the browser.
  const openDoc = async (slotKey) => {
    const doc = shown.docs[slotKey];
    if (!doc) { setNotice('No file is attached to this record.'); return; }
    setNotice('');
    let url = doc.url;
    if (!url) {
      const result = await attempt(() => staffApi.staffDocument(staff.id, slotKey));
      if (!result.ok) { setNotice(result.error); return; }
      url = URL.createObjectURL(result.data.blob);
    }
    window.open(url, '_blank', 'noopener');
  };
  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file && /^image\/(jpeg|png)$/.test(file.type) && file.size <= MAX_IMAGE_BYTES) setDraft((d) => ({ ...d, avatar: URL.createObjectURL(file), avatarFile: file }));
  };
  const confirmSave = async () => {
    if (saving) return;
    setSaving(true);
    const result = await onSave(draft);
    setSaving(false);
    if (result.ok) return;
    setConfirming(false);
    setSaveError(result.fields && Object.keys(result.fields).length ? Object.entries(result.fields).map(([f, m]) => `${f}: ${m}`).join('. ') : result.error);
  };
  const toggleActive = (next) => {
    if (next) setDraft((d) => ({ ...d, active: true, inactiveReason: '' }));
    else setReasonAsk({ text: '', error: '' });
  };
  const edit = (name) => (editing ? () => setDialog(name) : undefined);

  const { salary, epf } = shown;
  return (
    <div className="sd">
      <div className="sd-grid">
        <Card className="sd-profile" onEdit={edit('employment')}>
          <StaffPhoto src={picture} size={76}>
            {editing && (
              <>
                <input ref={photoInput} type="file" accept="image/jpeg,image/png" hidden onChange={onPhoto} />
                <button type="button" className="staff-photo__edit" onClick={() => photoInput.current?.click()} aria-label="Change picture"><CameraIcon size={11} /></button>
              </>
            )}
          </StaffPhoto>
          <div className="sd-profile__main">
            <div className="sd-profile__name">
              <h2>{shown.name}</h2>
              {editing && <StatusToggle checked={shown.active} ariaLabel="Staff is active" onChange={toggleActive} />}
              <StatusBadge active={shown.active} />
            </div>
            <span className="sd-profile__tag">{staffTag(shown.code)}</span>
            <span className="sd-profile__role">{shown.role}</span>
          </div>
          <dl className="sd-rows sd-rows--wide">
            <div><dt>Shift</dt><dd><ShiftBadge shift={shown.shift} /></dd></div>
            <div><dt>Joined on</dt><dd>{shown.joinDate.replaceAll('/', '.')}</dd></div>
            <div><dt>Team</dt><dd>{shown.team}</dd></div>
            {!shown.active && <div><dt>Inactive Reason</dt><dd>{dash(shown.inactiveReason)}</dd></div>}
          </dl>
        </Card>

        {isOwner && (
          <Card title="EPF/ETF Information" onEdit={edit('epf')}>
            <Rows rows={[
              ['EPF/EPF Eligibility', <span className={`badge badge--${epf.allowed ? 'active' : 'inactive'}`}>{epf.allowed ? 'Yes' : 'No'}</span>],
              ['EPF/ETF Number', epf.allowed ? `${epf.employerNumber}/${epf.employeeNumber}` : '-'],
              ['Employee EPF Rate', epf.allowed ? `${epf.employeeRate} %` : '-'],
              ['Employer EPF Rate', epf.allowed ? `${epf.employerRate} %` : '-'],
              ['Employer ETF Rate', epf.allowed ? `${epf.etfRate} %` : '-'],
            ]} />
          </Card>
        )}

        <Card title="Personal Information" onEdit={edit('personal')}>
          <Rows rows={[
            ['Gender', shown.gender], ['Email', shown.email], ['Phone Number', shown.phone],
            ['NIC', shown.nic], ['Date of Birth', shown.dob.replaceAll('/', '.')], ['Address', shown.address],
          ]} />
        </Card>

        {isOwner && (
          <Card title="Salary & Payroll" onEdit={edit('salary')}>
            <Rows rows={[
              ['Salary Type', salary.type], ['Basic Salary', money(salary.basic)],
              ['OverTime', salary.overtime ? 'Allowed' : 'Not Allowed'],
              ['OT Salary per Hour', salary.overtime ? money(salary.otRate) : '-'],
              ['Payment Method', dash(salary.method)],
              ['Bank Name(with Branch)', salary.method === 'Bank Transfer' ? dash(salary.bank) : '-'],
              ['Account Number', salary.method === 'Bank Transfer' ? dash(salary.account) : '-'],
            ]} />
          </Card>
        )}

        <Card title="Emergency Contact" onEdit={edit('emergency')}>
          <Rows rows={[['Contact Name', shown.emergency.name], ['Relationship', shown.emergency.relationship], ['Phone Number', shown.emergency.phone]]} />
        </Card>

        {isOwner && (
          <Card title="Documents" onEdit={edit('documents')}>
            <dl className="sd-rows">
              {DOCUMENT_SLOTS.map((slot) => (
                <div key={slot.key}>
                  <dt>{slot.viewLabel}</dt>
                  <dd><button type="button" className="btn btn-outline-green sd-view-btn" onClick={() => openDoc(slot.key)}>View</button></dd>
                </div>
              ))}
            </dl>
            {notice && <p className="sd-notice" role="status">{notice}</p>}
          </Card>
        )}
      </div>

      {!editing && (
        <button type="button" className="btn btn-outline-green sd-edit-btn" onClick={onEdit}><EditSquareIcon size={16} />Edit Staff</button>
      )}
      {!editing && <button type="button" className="sd-close" onClick={onClose} aria-label="Close"><CloseIcon size={18} /></button>}
      {editing && saveError && <p className="field-error" role="alert">{saveError}</p>}
      {editing && (
        <div className="sd-actions">
          <CancelButton onClick={onCancelEdit} />
          <SaveButton label="Save Changes" onClick={() => { setSaveError(''); setConfirming(true); }} />
        </div>
      )}

      {dialog === 'employment' && (
        <SectionDialog title="Employment Details" initial={{ name: draft.name, role: draft.role, shift: draft.shift, joinDate: draft.joinDate, team: draft.team }}
          check={(v) => {
            const found = only(validateEmployment({ ...draft, ...v }, { needAccess: false }), ['role', 'shift', 'joinDate', 'team']);
            return v.name.trim() ? found : { ...found, name: 'This field is required' };
          }}
          onClose={() => setDialog(null)} onApply={apply}>
          {(kit) => (
            <>
              {kit.text('name', 'Full name', 'Full name')}
              {kit.pick('role', 'Role', lists.roles, 'Role')}
              {kit.pick('shift', 'Shift', lists.shifts, 'Shift')}
              {kit.date('joinDate', 'Join On')}
              {kit.pick('team', 'Team', lists.teams, 'Team')}
            </>
          )}
        </SectionDialog>
      )}

      {dialog === 'personal' && (
        <SectionDialog title="Personal Information" initial={{ gender: draft.gender, email: draft.email, phone: draft.phone, nic: draft.nic, dob: draft.dob, address: draft.address }}
          check={(v) => only(validatePersonal({ ...draft, ...v }, { withContact: false }), ['gender', 'email', 'phone', 'nic', 'dob', 'address'])}
          onClose={() => setDialog(null)} onApply={apply}>
          {(kit) => (
            <>
              {kit.pick('gender', 'Gender', GENDERS, 'Gender')}
              {kit.text('email', 'Email', 'Email')}
              {kit.text('phone', 'Phone Number', 'Phone Number')}
              {kit.text('nic', 'NIC', 'NIC')}
              {kit.date('dob', 'Date of Birth')}
              {kit.area('address', 'Address', 'Address')}
            </>
          )}
        </SectionDialog>
      )}

      {dialog === 'emergency' && (
        <SectionDialog title="Emergency Contact" initial={{ emergency: draft.emergency }}
          check={(v) => validateEmergency(v.emergency, 'emergency.')} onClose={() => setDialog(null)} onApply={apply}>
          {(kit) => (
            <>
              {kit.text('emergency.name', 'Contact Name', 'Contact Name')}
              {kit.text('emergency.relationship', 'Relationship', 'Relationship')}
              {kit.text('emergency.phone', 'Phone Number', 'Phone Number')}
            </>
          )}
        </SectionDialog>
      )}

      {dialog === 'salary' && (
        <SectionDialog title="Salary & Payroll" initial={{ salary: draft.salary }} check={(v) => validateSalary(v.salary)}
          onClose={() => setDialog(null)} onApply={apply}>
          {(kit, form) => <SalaryFields kit={kit} values={form.values} />}
        </SectionDialog>
      )}

      {dialog === 'epf' && (
        <SectionDialog title="ETF/EPF Information" initial={{ epf: draft.epf }} check={(v) => validateEpf(v.epf)}
          onClose={() => setDialog(null)} onApply={apply}>
          {(kit, form) => <EpfFields kit={kit} values={form.values} withRates />}
        </SectionDialog>
      )}

      {dialog === 'documents' && (
        <SectionDialog title="Documents" initial={{ docs: draft.docs }} check={() => ({})} onClose={() => setDialog(null)} onApply={apply}>
          {(kit, form) => DOCUMENT_SLOTS.map((slot) => (
            <DocumentRow key={slot.key} slot={slot} value={form.values.docs[slot.key]}
              onPick={(file) => form.set(`docs.${slot.key}`, file)} onRemove={() => form.set(`docs.${slot.key}`, null)} />
          ))}
        </SectionDialog>
      )}

      {reasonAsk !== null && (
        <ConfirmationModal message="Enter the reason for inactive staff." confirmLabel="Save" className="modal--reason"
          onCancel={() => setReasonAsk(null)}
          onConfirm={() => {
            if (!reasonAsk.text.trim()) { setReasonAsk({ ...reasonAsk, error: 'This field is required' }); return; }
            setDraft((d) => ({ ...d, active: false, inactiveReason: reasonAsk.text.trim() }));
            setReasonAsk(null);
          }}>
          <input className={`input${reasonAsk.error ? ' has-error' : ''}`} autoFocus value={reasonAsk.text}
            placeholder="eg: Staff have to submit required documents" onChange={(e) => setReasonAsk({ text: e.target.value, error: '' })} />
          {reasonAsk.error && <span className="field-error">{reasonAsk.error}</span>}
        </ConfirmationModal>
      )}

      {confirming && (
        <ConfirmationModal message={'Click "Save Changes" to update the staff details.'} confirmLabel={saving ? 'Saving...' : 'Save Changes'}
          onCancel={() => setConfirming(false)} onConfirm={confirmSave} />
      )}
    </div>
  );
}
