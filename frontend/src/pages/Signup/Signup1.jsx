import { useState } from 'react';
import NextButton from '../../components/buttons/NextButton.jsx';
import { SignupLayout } from '../../stepper/SignupStepper.jsx';
import { serverErrors, validatePhone, validateRequired } from '../../validation/authValidation.js';

// Step 3: Owner's details. onNext() saves them in the Auth Service ({ ok, error?, fields? }) and starts the phone verification.
export default function Signup1({ values, onChange, onNext }) {
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const edit = (field) => (e) => { onChange({ [field]: e.target.value }); setErrors((er) => ({ ...er, [field]: '', _form: '' })); };
  const next = async (e) => {
    e.preventDefault();
    if (busy) return;
    const found = { ownerName: validateRequired(values.ownerName, "Enter the owner's name."), phone: validatePhone(values.phone) };
    setErrors(found);
    if (found.ownerName || found.phone) return;
    setBusy(true);
    const result = await onNext();
    if (!result.ok) { setBusy(false); setErrors(serverErrors(result)); }
  };

  return (
    <SignupLayout current={3} title="Owner's Details">
      <form className="signup-card" onSubmit={next} noValidate>
        <label className="signup-field">
          <span className="signup-label">Owner Name</span>
          <input className={`input${errors.ownerName ? ' has-error' : ''}`} value={values.ownerName} placeholder="eg; John" onChange={edit('ownerName')} autoComplete="off" />
          {errors.ownerName && <span className="auth-error auth-error--small">{errors.ownerName}</span>}
        </label>
        <label className="signup-field">
          <span className="signup-label">Phone Number</span>
          <input className={`input${errors.phone ? ' has-error' : ''}`} type="tel" value={values.phone} placeholder="eg; 0712345678" onChange={edit('phone')} autoComplete="off" />
          {errors.phone && <span className="auth-error auth-error--small">{errors.phone}</span>}
        </label>
        {errors._form && <span className="auth-error auth-error--small" role="alert">{errors._form}</span>}
        <NextButton type="submit" block label={busy ? 'Please wait...' : 'Next'} />
      </form>
    </SignupLayout>
  );
}
