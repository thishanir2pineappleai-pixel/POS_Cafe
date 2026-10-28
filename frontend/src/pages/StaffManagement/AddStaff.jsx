import { useState } from 'react';
import CancelButton from '../../components/buttons/CancelButton.jsx';
import SaveButton from '../../components/buttons/SaveButton.jsx';
import { AlertCircleIcon } from '../../components/common/Icons.jsx';
import StatusToggle from '../../components/common/StatusToggle.jsx';
import ConfirmationModal from '../../components/modals/ConfirmationModal.jsx';
import StaffStepper from '../../stepper/StaffStepper.jsx';
import { validateEmployment, validatePersonal, validateRecords } from '../../validation/staffValidation.js';
import {
  DocumentBox, EPF_NOTE, EpfFields, SalaryFields, StaffImageField, fieldKit, useForm,
} from './StaffFormParts.jsx';
import { DAYS, DOCUMENT_SLOTS, EMPLOYMENT_TYPES, GENDERS, blankStaff } from './staffConstants.js';

// The server's field names -> the form's, and the step that shows each.
const FIELD_ALIASES = { roleId: 'role', teamId: 'team', shiftId: 'shift', 'emergencyContact.name': 'emergency.name', 'emergencyContact.relationship': 'emergency.relationship', 'emergencyContact.phone': 'emergency.phone', emergencyContact: 'emergency.name' };
const stepOf = (field) => {
  if (/^(salary|epf)/.test(field)) return 3;
  return /^(name|gender|phone|email|nic|dob|address|emergency)/.test(field) ? 1 : 2;
};

// Add Staff: Personal Information -> Employment Details -> Employment Records (the last one only for the owner, who alone may
// see or set salary, EPF/ETF and documents). All values stay in this component until Save; then onSave(values) saves them
// with the Staff Service and resolves to { ok, error?, fields? }. `lists` holds the names of the roles, teams and shifts that exist.
export default function AddStaff({ lists, isOwner, onCancel, onSave }) {
  const form = useForm(blankStaff());
  const { values, errors, set, setErrors } = form;
  const [step, setStep] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const kit = fieldKit(form);
  const lastStep = isOwner ? 3 : 2;

  const checks = { 1: () => validatePersonal(values), 2: () => validateEmployment(values), 3: () => validateRecords(values) };
  const advance = () => {
    const found = checks[step]();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (step < lastStep) setStep(step + 1);
    else setConfirming(true);
  };
  const back = () => { setErrors({}); setStep(step - 1); };

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    const result = await onSave(values);
    if (result.ok) return;
    setSaving(false);
    setConfirming(false);
    const shown = {};
    for (const [field, message] of Object.entries(result.fields)) shown[FIELD_ALIASES[field] ?? field] = message;
    if (Object.keys(shown).length === 0) shown._form = result.error;
    setErrors(shown);
    setStep(Math.min(...Object.keys(shown).map((f) => (f === '_form' ? lastStep : stepOf(f)))));
  };

  return (
    <section className="panel staff-form">
      <StaffStepper current={step} />

      {step === 1 && (
        <div className="sf-body">
          <h2 className="sf-title">Personal Information</h2>
          <div className="sf-grid">
            {kit.text('name', 'Full Name', 'eg: John Doe')}
            {kit.pick('gender', 'Gender', GENDERS, 'eg: Male')}
            <StaffImageField form={form} />
            {kit.text('phone', 'Phone Number', 'eg: 071 123 4567')}
            {kit.text('email', 'Email', 'eg: example@gmail.com')}
            {kit.text('nic', 'NIC', 'eg: 1996 1234 5678')}
            {kit.date('dob', 'Date of Birth')}
            {kit.text('address', 'Address', 'eg: 478,  Meekanuwa Road, Kandy 20000 ,Sri Lanka', 'sf-span-2')}
          </div>
          <h2 className="sf-title sf-title--next">Emergency Contact</h2>
          <div className="sf-grid">
            {kit.text('emergency.name', 'Contact Name', 'eg: John')}
            {kit.text('emergency.relationship', 'Relationship', 'eg: Brother')}
            {kit.text('emergency.phone', 'Phone Number', 'eg: 071 123 4567')}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="sf-body">
          <h2 className="sf-title">Employment Details</h2>
          <div className="sf-grid">
            <div className="field">
              <span className="field-label">Employee Code <span className="optional">(Auto Generated)</span></span>
              <input className="input" value="Assigned when saved" readOnly aria-readonly="true" />
            </div>
            {kit.date('joinDate', 'Join Date')}
            {kit.pick('role', 'Role', lists.roles, 'eg: Manager')}
            {kit.pick('team', 'Team', lists.teams, 'eg: Service')}
            {kit.pick('employmentType', 'Employment Type', EMPLOYMENT_TYPES, 'eg: Fulltime')}
            <div className="field">
              <span className="field-label">Status</span>
              <StatusToggle checked={values.active} label={values.active ? 'Active' : 'Inactive'} onChange={(v) => set('active', v)} />
            </div>
            {!values.active && kit.text('inactiveReason', 'Reason of Inactive Staff', 'eg: Staff have to submit required documents', 'sf-span-3')}
          </div>

          <h2 className="sf-title sf-title--next">Shift Assignment</h2>
          <div className="sf-grid">
            {kit.pick('shift', 'Shift', lists.shifts, 'eg: Morning')}
            {kit.segment('workingDays', 'Working Days', DAYS, { multi: true })}
            {kit.text('hoursPerWeek', 'Working Hours/Week', 'eg: 40')}
          </div>

          <h2 className="sf-title sf-title--next">System Access</h2>
          <div className="sf-grid sf-grid--two">
            {kit.text('username', 'Username', 'eg: user123')}
            {kit.password('password', 'Password', 'eg: userpass@123')}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="sf-body">
          <h2 className="sf-title">Salary &amp; Payroll</h2>
          <div className="sf-grid sf-grid--salary"><SalaryFields kit={kit} values={values} /></div>

          <h2 className="sf-title sf-title--next">EPF &amp; ETF Information</h2>
          <div className="sf-grid sf-grid--epf"><EpfFields kit={kit} values={values} /></div>
          <p className="epf-note"><AlertCircleIcon size={13} />{EPF_NOTE}</p>

          <h2 className="sf-title sf-title--next">Required Documents</h2>
          <div className="sf-grid">
            {DOCUMENT_SLOTS.map((slot) => (
              <DocumentBox key={slot.key} slot={slot} value={values.docs[slot.key]} error={errors[`docs.${slot.key}`]}
                onPick={(file) => set(`docs.${slot.key}`, file)} />
            ))}
          </div>
        </div>
      )}

      {errors._form && <span className="field-error" role="alert">{errors._form}</span>}
      <div className="sf-actions">
        {step === 1 ? <CancelButton className="sf-actions__side" onClick={onCancel} />
          : <CancelButton className="sf-actions__side" label="Back" onClick={back} />}
        <SaveButton className="sf-actions__main" label={step === lastStep ? 'Save' : 'Continue'} onClick={advance} />
      </div>

      {confirming && (
        <ConfirmationModal message="Click 'Save' to add new staff ." confirmLabel={saving ? 'Saving...' : 'Save'}
          onCancel={() => setConfirming(false)} onConfirm={confirm} />
      )}
    </section>
  );
}
