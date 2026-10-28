import { PinIcon, PlusIcon } from '../../components/common/Icons.jsx';
import { Avatar } from '../../components/upload/AvatarUpload.jsx';

export function CreateCard({ title, hint, onClick }) {
  return (
    <button type="button" className="create-card" onClick={onClick}>
      <span className="create-card__plus"><PlusIcon size={26} /></span>
      <strong>{title}</strong>
      <small>{hint}</small>
    </button>
  );
}

// Shop Profiles tab: one card per shop of the account, then the create card (only the owner may create a shop).
export default function ShopProfiles({ shops, canCreate, onCreate, onOpen }) {
  return (
    <div className="card-grid">
      {shops.map((shop) => (
        <button type="button" className="profile-card" key={shop.id} onClick={() => onOpen(shop.id)}>
          <span className="badge-mint">{shop.status}</span>
          <span className="profile-card__head">
            <Avatar src={shop.avatar} size={52} />
            <span className="profile-card__name">{shop.name}</span>
          </span>
          <span className="profile-card__address"><PinIcon size={11} /><span>{shop.address}</span></span>
          <span className="profile-card__meta">Updated on {shop.updatedOn}</span>
        </button>
      ))}
      {canCreate && <CreateCard title="Create Shop Profile" hint="Add a new shop to your business" onClick={onCreate} />}
    </div>
  );
}
