import { useState } from 'react';
import CancelButton from '../../components/buttons/CancelButton.jsx';
import SaveButton from '../../components/buttons/SaveButton.jsx';
import Dropdown from '../../components/common/Dropdown.jsx';
import FormField from '../../components/common/FormField.jsx';
import ConfirmationModal from '../../components/modals/ConfirmationModal.jsx';
import AvatarUpload from '../../components/upload/AvatarUpload.jsx';
import { validateShop } from '../../validation/profileValidation.js';

const BLANK = { name: '', address: '', phone: '', email: '', website: '', timezone: '', avatar: null, avatarFile: null };

// Add / Edit Shop Profile form (EditShopProfile renders this with mode="edit"). `timezones` are the options the server accepts.
// onSave(values) saves with the Settings Service and resolves to { ok, error?, fields? }; the form stays open on a refusal.
export default function AddShopProfile({ mode = 'add', profile, timezones = [], onCancel, onSave }) {
  const edit = mode === 'edit';
  const [values, setValues] = useState(profile ? { ...BLANK, ...profile } : BLANK);
  const [errors, setErrors] = useState({});
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
    const found = validateShop(values);
    setErrors(found);
    if (Object.keys(found).length === 0) setConfirming(true);
  };
  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    const result = await onSave({ ...values, name: values.name.trim() });
    if (!result.ok) { setSaving(false); setConfirming(false); setErrors({ ...result.fields, _form: result.error }); }
  };

  return (
    <section className="panel settings-card profile-form">
      <h2 className="settings-card__title">Business Information</h2>
      <div className="profile-form__avatar">
        <AvatarUpload value={values.avatar} onChange={(url, file) => { set('avatar', url); set('avatarFile', file); }} />
      </div>

      <FormField label="Shop Name" error={errors.name} className="field--short">{text('name', 'Enter shop name')}</FormField>
      <FormField label="Business Address" error={errors.address}>{text('address', 'Enter shop address')}</FormField>
      <FormField label="Phone Number" error={errors.phone}>{text('phone', 'Enter phone number')}</FormField>
      <FormField label="Email" optional error={errors.email}>{text('email', 'Enter email address')}</FormField>
      <FormField label="Website" optional error={errors.website}>{text('website', 'Enter your website')}</FormField>
      <div className="field">
        <span className="field-label">Timezone</span>
        <Dropdown className={`dropdown--tz${errors.timezone ? ' has-error' : ''}`} triangle value={values.timezone}
          options={timezones.map((label) => ({ value: label, label }))} placeholder="Select timezone" onChange={(v) => set('timezone', v)} />
        {errors.timezone && <span className="field-error">{errors.timezone}</span>}
      </div>
      {errors._form && <span className="field-error" role="alert">{errors._form}</span>}

      <div className="profile-form__actions">
        <CancelButton className="profile-cancel" onClick={onCancel} />
        <SaveButton className="profile-save" label="Save" onClick={requestSave} />
      </div>

      {confirming && (
        <ConfirmationModal
          message={edit ? "Click 'Save Changes' to update your profile." : "Let's set up your shop profile!"}
          confirmLabel={saving ? 'Saving...' : edit ? 'Save Changes' : 'Save'}
          onCancel={() => setConfirming(false)}
          onConfirm={confirm} />
      )}
    </section>
  );
}
