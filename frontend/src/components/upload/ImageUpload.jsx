import { useRef } from 'react';
import { UploadIcon } from '../common/Icons.jsx';

const MAX_BYTES = 2 * 1024 * 1024;

// `value` is an image URL (or null). Empty: one-line field. With an image: thumbnail + "Click to Upload" box.
export default function ImageUpload({ value, onChange }) {
  const inputRef = useRef(null);
  const pick = () => inputRef.current?.click();
  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file && /^image\/(jpeg|png)$/.test(file.type) && file.size <= MAX_BYTES) onChange(URL.createObjectURL(file), file); // the File is what gets uploaded
  };

  return (
    <div className="upload">
      <input ref={inputRef} type="file" accept="image/jpeg,image/png" hidden onChange={onFile} />
      {value ? (
        <div className="upload__filled">
          <img src={value} alt="Item" className="upload__thumb" />
          <button type="button" className="upload__box" onClick={pick}>
            <UploadIcon size={18} />
            <span>Click to Upload</span>
            <small>JPG, PNG, max 2MB</small>
          </button>
        </div>
      ) : (
        <>
          <button type="button" className="input input-select is-placeholder" onClick={pick}>
            <span>Upload an image</span>
            <UploadIcon size={16} />
          </button>
          <small className="upload__hint">Upload an image (JPG, PNG, max 2MB)</small>
        </>
      )}
    </div>
  );
}
