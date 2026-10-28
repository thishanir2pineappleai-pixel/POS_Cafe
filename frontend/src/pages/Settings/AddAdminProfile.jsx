import { useState } from 'react';
import CancelButton from '../../components/buttons/CancelButton.jsx';
import SaveButton from '../../components/buttons/SaveButton.jsx';
import FormField from '../../components/common/FormField.jsx';
import { EyeIcon, EyeOffIcon } from '../../components/common/Icons.jsx';
import ConfirmationModal from '../../components/modals/ConfirmationModal.jsx';
import AvatarUpload from '../../components/upload/AvatarUpload.jsx';
import { validateAdmin } from '../../validation/profileValidation.js';

const BLANK = { firstName: '', lastName: '', phone: '', email: '', password: '', avatar: null, avatarFile: null };

// Add / Edit Admin Profile form (EditAdminProfile renders this with mode="edit", which has no password field).
// onSave(values) saves with the Auth Service and resolves to { ok, error?, fields? }; the form stays open on a refusal.
export default function AddAdminProfile({ mode = 'add', profile, onCancel, onSave }) {
  const edit = mode === 'edit';
  const [values, setValues] = useState(profile ? { ...BLANK, ...profile } : BLANK);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, _form: undefined }));
  };
  const text = (key, placeholder) => (
    <input className={`input${errors[key] ? ' has-error' : ''}`} value={values[key]} placeholder={placeholder}
      onChange={(e) => set(key, e.target.value)} />
  );

  const requestSave = () => {
    const found = validateAdmin(values, { needPassword: !edit });
    setErrors(found);
    if (Object.keys(found).length === 0) setConfirming(true);
  };
  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    const result = await onSave(values);
    if (!result.ok) { setSaving(false); setConfirming(false); setErrors({ ...result.fields, _form: result.error }); }
  };

  return (
    <section className="panel settings-card profile-form">
      <div className="profile-form__avatar">
        <AvatarUpload compact value={values.avatar} onChange={(url, file) => { set('avatar', url); set('avatarFile', file); }} />
      </div>

      <FormField label="First Name" error={errors.firstName} className="field--short">{text('firstName', 'Enter first name')}</FormField>
      <FormField label="Last Name" error={errors.lastName}>{text('lastName', 'Enter last name')}</FormField>
      <FormField label="Phone Number" error={errors.phone}>{text('phone', 'Enter phone number')}</FormField>
      <FormField label="Email" error={errors.email}>{text('email', 'Enter email')}</FormField>
      {!edit && (
        <FormField label="Password" error={errors.password}>
          <span className="input-suffix">
            <input className={`input${errors.password ? ' has-error' : ''}`} type={showPassword ? 'text' : 'password'}
              value={values.password} placeholder="Enter your password" onChange={(e) => set('password', e.target.value)} />
            <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </span>
        </FormField>
      )}
      {errors._form && <span className="field-error" role="alert">{errors._form}</span>}

      <div className="profile-form__actions">
        <CancelButton className="profile-cancel" onClick={onCancel} />
        <SaveButton className="profile-save" label="Save" onClick={requestSave} />
      </div>

      {confirming && (
        <ConfirmationModal
          message={edit ? "Click 'Save Changes' to update admin profile." : "Let's set up your Admin Profile!"}
          confirmLabel={saving ? 'Saving...' : edit ? 'Save Changes' : 'Save'}
          onCancel={() => setConfirming(false)}
          onConfirm={confirm} />
      )}
    </section>
  );
}
