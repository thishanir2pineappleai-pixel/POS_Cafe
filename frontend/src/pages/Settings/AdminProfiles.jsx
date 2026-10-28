import { Avatar } from '../../components/upload/AvatarUpload.jsx';
import { CreateCard } from './ShopProfiles.jsx';

// Admin Profiles tab: one card per login user of the account (the owner included), then the create card (owner only).
export default function AdminProfiles({ admins, canCreate, onCreate, onOpen }) {
  return (
    <div className="card-grid">
      {admins.map((admin) => (
        <button type="button" className="profile-card profile-card--admin" key={admin.id} onClick={() => onOpen(admin.id)}>
          <span className="badge-mint">{admin.role}</span>
          <span className="profile-card__head">
            <Avatar src={admin.avatar} size={44} />
            <span>
              <span className="profile-card__name profile-card__name--sm">{admin.firstName} {admin.lastName}</span>
              <span className="profile-card__email">{admin.email}</span>
            </span>
          </span>
        </button>
      ))}
      {canCreate && <CreateCard title="Create Admin Profile" hint="Add a new admin to your business" onClick={onCreate} />}
    </div>
  );
}
