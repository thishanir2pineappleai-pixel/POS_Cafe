import { EditSquareIcon } from '../../components/common/Icons.jsx';
import { Avatar } from '../../components/upload/AvatarUpload.jsx';
import ChangeAdminPassword from './ChangeAdminPassword.jsx';

export default function AdminProfileDetails({ admin, onEdit, onDraftChange, onUpdatePassword }) {
  const rows = [
    ['First Name', admin.firstName],
    ['Last Name', admin.lastName],
    ['Phone Number', admin.phone],
    ['Email', admin.email],
  ];

  return (
    <>
      <h2 className="admin-view__title">Admin Information</h2>
      <section className="panel view-card view-card--admin">
        <div className="view-card__head">
          <div className="admin-summary">
            <Avatar src={admin.avatar} size={52} />
            <div>
              <strong>{admin.firstName}</strong>
              <span className="admin-summary__email">{admin.email}</span>
              <span className="badge-mint badge-mint--static">{admin.role}</span>
            </div>
          </div>
          <button type="button" className="btn btn-outline-green" onClick={onEdit}><EditSquareIcon size={16} />Edit Profile</button>
        </div>

        <dl className="admin-rows">
          {rows.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
          <div className="admin-rows__password">
            <dt>Password</dt>
            <dd><ChangeAdminPassword onDraftChange={onDraftChange} onUpdate={onUpdatePassword} /></dd>
          </div>
        </dl>
      </section>
    </>
  );
}
