import { Fragment, useCallback, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import * as adminApi from '../../api/adminProfileApi.js';
import { uploadUrl } from '../../api/client.js';
import { attempt, messageFor } from '../../api/errorHandler.js';
import * as settingsApi from '../../api/settingsApi.js';
import * as shopApi from '../../api/shopProfileApi.js';
import ErrorState from '../../components/common/ErrorState.jsx';
import { ChevronRightIcon } from '../../components/common/Icons.jsx';
import LoadingState from '../../components/common/LoadingState.jsx';
import SuccessModal from '../../components/modals/SuccessModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import MainLayout from '../../layout/MainLayout.jsx';
import AddAdminProfile from './AddAdminProfile.jsx';
import AddShopProfile from './AddShopProfile.jsx';
import AdminProfileDetails from './AdminProfileDetails.jsx';
import AdminProfiles from './AdminProfiles.jsx';
import EditAdminProfile from './EditAdminProfile.jsx';
import EditShopProfile from './EditShopProfile.jsx';
import ShopProfileDetails from './ShopProfileDetails.jsx';
import ShopProfiles from './ShopProfiles.jsx';

const TABS = [{ id: 'shop', label: 'Shop Profiles' }, { id: 'admin', label: 'Admin Profiles' }];

const crumbs = (...parts) => parts.map((part, i) => (
  <Fragment key={part}>{i > 0 && <ChevronRightIcon size={22} className="title-sep" />}{part}</Fragment>
));

const MANAGE = 'Manage your accounts details';
// [last breadcrumb, subtitle] per tab and view. Subtitles are copied from the designs, quirks included.
const HEADERS = {
  shop: {
    list: [null, MANAGE],
    add: ['Add Shop Profile', 'Add your account details.'],
    details: ['View Shop Profile', 'Add your account details.'],
    edit: ['Edit Shop Profile', 'Edit your account details.'],
  },
  admin: {
    list: [null, MANAGE],
    add: ['Add Admin Profile', 'Add your Admin details.'],
    details: ['View Admin Profile', 'Add your account details.'],
    edit: ['Edit Admin Profile', 'Add your Admin details.'],
  },
};

const updatedOn = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// API rows -> the shapes the forms and cards use ('' instead of null; a picture URL instead of a stored file name).
const shopModel = (s) => ({
  id: s.id, name: s.name, address: s.address, phone: s.phone, email: s.email ?? '', website: s.website ?? '', timezone: s.timezone ?? '',
  status: s.status, avatar: uploadUrl(s.image), avatarFile: null, updatedOn: updatedOn(s.updatedAt),
});
const adminModel = (a) => ({
  id: a.id, firstName: a.firstName, lastName: a.lastName, phone: a.phone, email: a.email, role: a.role, avatar: uploadUrl(a.image), avatarFile: null,
});

// Shop and admin profiles are stored by the Settings Service and the Auth Service (through the Gateway). Only the owner may
// create a shop or an admin; the server enforces that too.
export default function Settings() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const { pathname } = useLocation();
  const isOwner = user?.role === 'Owner';
  const tab = pathname.startsWith('/settings/admins') ? 'admin' : 'shop';
  const view = pathname.endsWith('/new') ? 'add' : pathname.endsWith('/edit') ? 'edit' : id ? 'details' : 'list';
  const shopId = tab === 'shop' ? id : null;
  const adminId = tab === 'admin' ? id : null;
  const [typingPassword, setTypingPassword] = useState(false);
  const [toast, setToast] = useState(null);

  const shopsLoad = useResource((signal) => shopApi.listShops(signal));
  const adminsLoad = useResource((signal) => adminApi.listAdmins(signal));
  const timezonesLoad = useResource((signal) => settingsApi.listTimezones(signal));
  const shops = (shopsLoad.data ?? []).map(shopModel);
  const admins = (adminsLoad.data ?? []).map(adminModel);
  const shop = shops.find((s) => s.id === shopId);
  const admin = admins.find((a) => a.id === adminId);

  const showToast = (title, message) => setToast({ id: Date.now(), title, message });
  const closeToast = useCallback(() => setToast(null), []);
  const go = (nextTab, nextView = 'list', profileId) => {
    setTypingPassword(false);
    const section = nextTab === 'admin' ? 'admins' : 'shops';
    const path = nextView === 'list' ? (nextTab === 'admin' ? '/settings/admins' : '/settings')
      : nextView === 'add' ? `/settings/${section}/new`
        : `/settings/${section}/${profileId}${nextView === 'edit' ? '/edit' : ''}`;
    navigate(path);
  };

  // Uploads the chosen picture after the profile exists. A failed upload does not undo the saved profile; it is reported.
  const uploadPicture = async (upload, id, file) => {
    if (!file) return '';
    try { await upload(id, file); return ''; } catch (err) { return messageFor(err); }
  };
  const done = (title, message, pictureProblem) => showToast(title, pictureProblem ? `${message} The picture was not saved: ${pictureProblem}` : message);

  const saveShop = (id, title, message) => async (v) => {
    const body = { name: v.name.trim(), address: v.address.trim(), phone: v.phone.trim(), email: v.email.trim() || undefined, website: v.website.trim() || undefined, timezone: v.timezone };
    const result = await attempt(() => (id ? shopApi.updateShop(id, body) : shopApi.createShop(body)));
    if (!result.ok) return result;
    const problem = await uploadPicture(shopApi.uploadShopImage, result.data.id, v.avatarFile);
    shopsLoad.reload();
    refreshUser(); // the shop names shown in the header come from /auth/me
    go('shop');
    done(title, message, problem);
    return result;
  };
  const saveAdmin = (id, title, message) => async (v) => {
    const body = { firstName: v.firstName.trim(), lastName: v.lastName.trim(), phone: v.phone.trim(), email: v.email.trim() };
    const result = await attempt(() => (id ? adminApi.updateAdmin(id, body) : adminApi.createAdmin({ ...body, password: v.password })));
    if (!result.ok) return result;
    const problem = await uploadPicture(adminApi.uploadAdminImage, result.data.id, v.avatarFile);
    adminsLoad.reload();
    refreshUser();
    go('admin');
    done(title, message, problem);
    return result;
  };
  const changePassword = async (password) => {
    const result = await attempt(() => adminApi.changeAdminPassword(adminId, password));
    if (result.ok) showToast('Password updated successfully', 'Your new password has been saved and is now active.');
    return result;
  };

  let [last, subtitle] = HEADERS[tab][view];
  if (tab === 'admin' && view === 'details' && typingPassword) last = 'Update Admin Password';

  const active = tab === 'shop' ? shopsLoad : adminsLoad;

  return (
    <MainLayout title={crumbs('Settings', 'Profile', ...(last ? [last] : []))} subtitle={subtitle} active="Settings">
      {view === 'list' && (
        <div className="settings-list">
          <div className="tabs" role="tablist">
            {TABS.map(({ id, label }) => (
              <button type="button" role="tab" key={id} aria-selected={tab === id} className={`tab${tab === id ? ' is-active' : ''}`}
                onClick={() => go(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="settings-list__body">
            {active.loading && !active.data && <LoadingState />}
            {active.error && <ErrorState message={active.error} onRetry={active.reload} />}
            {active.data && (tab === 'shop'
              ? <ShopProfiles shops={shops} canCreate={isOwner} onCreate={() => go('shop', 'add')} onOpen={(profileId) => go('shop', 'details', profileId)} />
              : <AdminProfiles admins={admins} canCreate={isOwner} onCreate={() => go('admin', 'add')} onOpen={(profileId) => go('admin', 'details', profileId)} />)}
          </div>
        </div>
      )}

      {tab === 'shop' && view === 'add' && (
        <AddShopProfile timezones={timezonesLoad.data ?? []} onCancel={() => go('shop')}
          onSave={saveShop(null, 'Shop Profile Added Successfully !', 'The shop has been created and is now active.')} />
      )}
      {tab === 'shop' && view === 'details' && shop && <ShopProfileDetails shop={shop} onEdit={() => go('shop', 'edit', shopId)} />}
      {tab === 'shop' && view === 'edit' && shop && (
        <EditShopProfile profile={shop} timezones={timezonesLoad.data ?? []} onCancel={() => go('shop', 'details', shopId)}
          onSave={saveShop(shopId, 'Shop profile updated successfully!', 'All changes to your shop profile have been saved.')} />
      )}

      {tab === 'admin' && view === 'add' && (
        <AddAdminProfile onCancel={() => go('admin')}
          onSave={saveAdmin(null, 'Admin Profile Added Successfully !', 'You can now log in and access the system.')} />
      )}
      {tab === 'admin' && view === 'details' && admin && (
        <AdminProfileDetails admin={admin} onEdit={() => go('admin', 'edit', adminId)} onDraftChange={setTypingPassword} onUpdatePassword={changePassword} />
      )}
      {tab === 'admin' && view === 'edit' && admin && (
        <EditAdminProfile profile={admin} onCancel={() => go('admin', 'details', adminId)}
          onSave={saveAdmin(adminId, 'Admin Profile Updated Successfully !', 'You can now log in and access the system.')} />
      )}

      {toast && <SuccessModal key={toast.id} title={toast.title} message={toast.message} onClose={closeToast} />}
    </MainLayout>
  );
}
