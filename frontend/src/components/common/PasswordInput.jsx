import { useState } from 'react';
import ShowPasswordButton from '../buttons/ShowPasswordButton.jsx';

// Password field with the eye toggle. Extra props (value, onChange, placeholder, className, ...) go to the input.
export default function PasswordInput({ invalid = false, className = '', ...rest }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="input-suffix">
      <input {...rest} className={`input${invalid ? ' has-error' : ''} ${className}`} type={visible ? 'text' : 'password'} autoComplete="off" />
      <ShowPasswordButton visible={visible} onClick={() => setVisible(!visible)} />
    </span>
  );
}
