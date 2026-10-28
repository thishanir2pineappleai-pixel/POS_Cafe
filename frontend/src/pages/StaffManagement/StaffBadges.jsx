import * as staffApi from '../../api/staffApi.js';
import { UserIcon } from '../../components/common/Icons.jsx';
import { Avatar } from '../../components/upload/AvatarUpload.jsx';
import { useBlobUrl } from '../../hooks/useBlobUrl.js';

export function ShiftBadge({ shift }) {
  return <span className={`badge badge--shift-${shift.toLowerCase()}`}>{shift}</span>;
}

export function StatusBadge({ active }) {
  return <span className={`badge badge--${active ? 'active' : 'inactive'}`}>{active ? 'Active' : 'Inactive'}</span>;
}

// The staff picture is private, so it is fetched with the signed-in token. `staff.image` is the server path or null; a picture
// just chosen in a form (`staff.avatar`, an object URL) is shown as it is.
export function useStaffPicture(staff) {
  const fetched = useBlobUrl(staff.image, () => staffApi.staffImage(staff.id));
  return staff.avatar ?? fetched;
}

export function StaffAvatar({ staff, size }) {
  return <Avatar src={useStaffPicture(staff)} size={size} />;
}

// Square staff picture (detail pages) or the green user icon when there is none.
export function StaffPhoto({ src, size = 76, children }) {
  return (
    <span className="staff-photo" style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" /> : <UserIcon size={Math.round(size * 0.45)} />}
      {children}
    </span>
  );
}
