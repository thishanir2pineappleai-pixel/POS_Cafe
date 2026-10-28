import { useState } from 'react';
import NextButton from '../../components/buttons/NextButton.jsx';
import { SignupLayout } from '../../stepper/SignupStepper.jsx';
import { serverErrors, validateRequired } from '../../validation/authValidation.js';

// Step 5: Business details. onNext() saves them in the Auth Service ({ ok, error?, fields? }), which then sends the access key.
// `notice` is shown when the phone step was skipped by the server (local development), so nobody believes the phone was verified.
export default function Signup({ values, onChange, onNext, notice }) {
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const edit = (field) => (e) => { onChange({ [field]: e.target.value }); setErrors((er) => ({ ...er, [field]: '', _form: '' })); };
  const next = async (e) => {
    e.preventDefault();
    if (busy) return;
    const found = {
      businessName: validateRequired(values.businessName, 'Enter the business name.'),
      address: validateRequired(values.address, 'Enter the address.'),
    };
    setErrors(found);
    if (found.businessName || found.address) return;
    setBusy(true);
    const result = await onNext();
    if (!result.ok) { setBusy(false); setErrors(serverErrors(result)); }
  };

  return (
    <SignupLayout current={5} title="Business Details">
      <form className="signup-card" onSubmit={next} noValidate>
        {notice && <p className="auth-error auth-error--small" role="status">{notice}</p>}
        <label className="signup-field">
          <span className="signup-label">Business name</span>
          <input className={`input${errors.businessName ? ' has-error' : ''}`} value={values.businessName} placeholder="eg; John" onChange={edit('businessName')} autoComplete="off" />
          {errors.businessName && <span className="auth-error auth-error--small">{errors.businessName}</span>}
        </label>
        <label className="signup-field">
          <span className="signup-label">Address</span>
          <input className={`input${errors.address ? ' has-error' : ''}`} value={values.address} placeholder="eg; Jaffna" onChange={edit('address')} autoComplete="off" />
          {errors.address && <span className="auth-error auth-error--small">{errors.address}</span>}
        </label>
        {errors._form && <span className="auth-error auth-error--small" role="alert">{errors._form}</span>}
        <NextButton type="submit" block label={busy ? 'Please wait...' : 'Next'} />
      </form>
    </SignupLayout>
  );
}
