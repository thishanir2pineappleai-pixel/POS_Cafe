import { useRef } from 'react';
import { CameraIcon, UserIcon } from '../common/Icons.jsx';

const MAX_BYTES = 2 * 1024 * 1024;

// Green circle with a user icon, or the chosen picture.
export function Avatar({ src, size = 52 }) {
  return (
    <span className="avatar-circle" style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" /> : <UserIcon size={Math.round(size * 0.45)} />}
    </span>
  );
}

// Profile picture box with the camera control. `readOnly` shows the same box without upload (view screens).
export default function AvatarUpload({ value, onChange, readOnly = false, compact = false }) {
  const inputRef = useRef(null);
  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file && file.type.startsWith('image/') && file.size <= MAX_BYTES) onChange(URL.createObjectURL(file), file); // the File is what gets uploaded
  };

  return (
    <div className={`avatar-box${compact ? ' avatar-box--sm' : ''}`}>
      <Avatar src={value} size={compact ? 48 : 62} />
      {readOnly ? (
        <span className="avatar-box__camera"><CameraIcon size={14} /></span>
      ) : (
        <>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={onFile} />
          <button type="button" className="avatar-box__camera" onClick={() => inputRef.current?.click()} aria-label="Upload picture">
            <CameraIcon size={14} />
          </button>
        </>
      )}
    </div>
  );
}
