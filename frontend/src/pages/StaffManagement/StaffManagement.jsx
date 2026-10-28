import { Fragment, useCallback, useEffect, useState } from 'react';
import { attempt, messageFor } from '../../api/errorHandler.js';
import * as staffApi from '../../api/staffApi.js';
import AddButton from '../../components/buttons/AddButton.jsx';
import ClearAllButton from '../../components/buttons/ClearAllButton.jsx';
import DeleteButton from '../../components/buttons/DeleteButton.jsx';
import FilterButton from '../../components/buttons/FilterButton.jsx';
import Dropdown from '../../components/common/Dropdown.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import {
  ActivityIcon, CashIcon, CheckCircleIcon, ChevronRightIcon, EditIcon, EyeIcon, ShieldIcon, StaffIcon, SunIcon, CalendarIcon, UserIcon, XCircleIcon,
} from '../../components/common/Icons.jsx';
import LoadingState from '../../components/common/LoadingState.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import SearchInput from '../../components/common/SearchInput.jsx';
import ConfirmationModal from '../../components/modals/ConfirmationModal.jsx';
import SuccessModal from '../../components/modals/SuccessModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useResource } from '../../hooks/useResource.js';
import MainLayout from '../../layout/MainLayout.jsx';
import AddStaff from './AddStaff.jsx';
import { ShiftBadge, StaffAvatar, StatusBadge } from './StaffBadges.jsx';
import StaffDetails from './StaffDetails.jsx';
import { options } from './StaffFormParts.jsx';
import { DEFAULT_ROLES, DEFAULT_SHIFTS, DEFAULT_TEAMS, DOCUMENT_SLOTS, PAGE_SIZE, staffTag } from './staffConstants.js';
import { createBody, fromApi, patchBody, statusChanged } from './staffMapper.js';

const NO_FILTERS = { role: '', team: '', shift: '', status: '' };
const SUBTITLE = 'Manage your staff, attendance, shifts, and permissions.';

// Only the Staff List tab is built in this stage. The others have designs but are outside the approved scope, so they do nothing yet.
const TABS = [
  { id: 'list', label: 'Staff List', Icon: UserIcon, built: true },
  { id: 'shift', label: 'Shift', Icon: CalendarIcon },
  { id: 'roles', label: 'Roles & Permission', Icon: ShieldIcon },
  { id: 'payroll', label: 'Payroll', Icon: CashIcon },
  { id: 'attendance', label: 'Attendance', Icon: ActivityIcon },
];

const COLUMNS = ['Staff', 'Role & Team', 'Shift', 'Contact', 'Last Login', 'Status', 'Action'];
const COLS = '1.5fr 1.1fr .9fr 1.6fr 1fr .8fr 1fr';

const crumbs = (...parts) => parts.map((part, i) => (
  <Fragment key={part}>{i > 0 && <ChevronRightIcon size={22} className="title-sep" />}{part}</Fragment>
));

function SummaryCard({ tone, Icon, label, value }) {
  return (
    <div className="staff-stat">
      <span className={`staff-stat__icon staff-stat__icon--${tone}`}><Icon size={20} /></span>
      <div>
        <div className="staff-stat__label">{label}</div>
        <div className="staff-stat__value">{value}</div>
      </div>
    </div>
  );
}

const two = (n) => String(n).padStart(2, '0');

function FilterSelect({ label, value, list, allLabel, onChange }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <Dropdown className="dropdown--green" triangle value={value} placeholder={allLabel}
        options={[{ value: '', label: allLabel }, ...options(list)]} onChange={onChange} />
    </div>
  );
}

// Staff, roles, teams and shifts are stored by the Staff Service (through the Gateway). Salary, EPF/ETF and documents belong to
// the owner: for anyone else the server does not send them and the screens do not show them.
export default function StaffManagement() {
  const { user } = useAuth();
  const isOwner = user?.role === 'Owner';
  const [screen, setScreen] = useState({ name: 'list' }); // list | add | details | edit
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState(null);
  const [problem, setProblem] = useState('');
  const [settingUp, setSettingUp] = useState(false);

  const showToast = (title, message) => setToast({ id: Date.now(), title, message });
  const closeToast = useCallback(() => setToast(null), []);
  const toList = () => { setScreen({ name: 'list' }); setProblem(''); };

  const rolesLoad = useResource((signal) => staffApi.listRoles(signal));
  const teamsLoad = useResource((signal) => staffApi.listTeams(signal));
  const shiftsLoad = useResource((signal) => staffApi.listShifts(signal));
  const summaryLoad = useResource((signal) => staffApi.staffSummary(signal));
  const roles = rolesLoad.data ?? [];
  const teams = teamsLoad.data ?? [];
  const shifts = shiftsLoad.data ?? [];
  const lists = { roles, teams, shifts };
  const names = { roles: roles.map((r) => r.name), teams: teams.map((t) => t.name), shifts: shifts.map((s) => s.name) };
  const listsReady = rolesLoad.data && teamsLoad.data && shiftsLoad.data;
  const needsSetup = listsReady && (roles.length === 0 || teams.length === 0 || shifts.length === 0);

  const idOf = (list, name) => list.find((x) => x.name === name)?.id;
  const roleId = idOf(roles, filters.role);
  const teamId = idOf(teams, filters.team);
  const shiftId = idOf(shifts, filters.shift);
  const status = filters.status ? filters.status.toLowerCase() : undefined;
  const list = useResource((signal) => staffApi.listStaff({ q: search, roleId, teamId, shiftId, status, page, limit: PAGE_SIZE }, signal), [search, roleId, teamId, shiftId, status, page]);
  const detail = useResource((signal) => (screen.id ? staffApi.getStaff(screen.id, signal) : Promise.resolve(null)), [screen.id]);
  const current = detail.data ? fromApi(detail.data) : null;

  const totalPages = list.data?.meta?.totalPages ?? 1;
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const reloadAll = () => { list.reload(); summaryLoad.reload(); rolesLoad.reload(); teamsLoad.reload(); shiftsLoad.reload(); };
  const updateQuery = (value) => { setQuery(value); setPage(1); };
  const updateFilter = (key) => (value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };
  const clearFilters = () => { setFilters(NO_FILTERS); setPage(1); };

  // Creates whatever of the starting roles, teams and shifts is missing (owner only; the server enforces who may).
  const setUp = async () => {
    setSettingUp(true);
    const calls = [
      ...DEFAULT_ROLES.filter((n) => !names.roles.includes(n)).map((n) => () => staffApi.createRole(n)),
      ...DEFAULT_TEAMS.filter((n) => !names.teams.includes(n)).map((n) => () => staffApi.createTeam(n)),
      ...DEFAULT_SHIFTS.filter((s) => !names.shifts.includes(s.name)).map((s) => () => staffApi.createShift(s)),
    ];
    for (const call of calls) {
      const result = await attempt(call); // one at a time: the server numbers and checks each
      if (!result.ok) { setProblem(result.error); break; }
    }
    setSettingUp(false);
    reloadAll();
  };

  // A failed upload does not undo the saved record; it is reported in the message.
  const uploadFiles = async (id, values) => {
    const notes = [];
    if (values.avatarFile) {
      const r = await attempt(() => staffApi.uploadStaffImage(id, values.avatarFile));
      if (!r.ok) notes.push(`The picture was not saved: ${r.error}`);
    }
    if (isOwner) {
      for (const slot of DOCUMENT_SLOTS) {
        const doc = values.docs[slot.key];
        if (!doc?.file) continue;
        const r = await attempt(() => staffApi.uploadStaffDocument(id, slot.key, doc.file));
        if (!r.ok) notes.push(`${slot.label} was not saved: ${r.error}`);
      }
    }
    return notes.length ? ` ${notes.join(' ')}` : '';
  };

  const addStaff = async (values) => {
    const result = await attempt(() => staffApi.createStaff(createBody(values, lists, { withRecords: isOwner })));
    if (!result.ok) return result;
    const note = await uploadFiles(result.data.id, values);
    reloadAll();
    setPage(1);
    toList();
    showToast('Staff Added Successfully!', `The new staff has been added and is now active in the system.${note}`);
    return result;
  };

  const saveEdit = async (draft) => {
    const before = current;
    const result = await attempt(() => staffApi.updateStaff(draft.id, patchBody(draft, lists, { withRecords: isOwner })));
    if (!result.ok) return result;
    if (statusChanged(before, draft)) {
      const status = await attempt(() => staffApi.setStaffStatus(draft.id, { active: draft.active, inactiveReason: draft.active ? undefined : draft.inactiveReason }));
      if (!status.ok) return status;
    }
    const note = await uploadFiles(draft.id, draft);
    reloadAll();
    detail.reload();
    toList();
    showToast('Staff Updated Successfully!', `The staff details has been updated in the system.${note}`);
    return result;
  };

  const confirmDelete = async () => {
    const target = deleting;
    setDeleting(null);
    const result = await attempt(() => staffApi.deleteStaff(target.id));
    if (!result.ok) { setProblem(result.error); return; }
    setProblem('');
    reloadAll();
    showToast('Staff deleted successfully', 'The staff record was removed from the list. It is kept and can be restored.');
  };

  const title = screen.name === 'add' ? crumbs('Staff Management', 'Staff List', 'Add Staff') : crumbs('Staff Management', 'Staff List');
  const summary = summaryLoad.data;
  const rows = list.data?.data ?? [];
  const setupBanner = needsSetup && (
    <section className="panel" role="status">
      <p>
        There are no roles, teams or shifts yet, and a staff member needs one of each. The Roles and Shift screens are not built yet.
        {isOwner ? ' Create the starting set (the roles and teams from the design and three shifts with placeholder hours) to continue.' : ' Ask the owner to set them up.'}
      </p>
      {isOwner && <button type="button" className="btn btn-outline-green" onClick={setUp} disabled={settingUp}>{settingUp ? 'Creating...' : 'Create roles, teams and shifts'}</button>}
    </section>
  );

  return (
    <MainLayout title={title} subtitle={SUBTITLE} active="Staff Management">
      {screen.name === 'list' && (
        <>
          <div className="staff-tabs" role="tablist">
            {TABS.map(({ id, label, Icon, built }) => (
              <button type="button" role="tab" key={id} aria-selected={Boolean(built)} aria-disabled={!built}
                title={built ? undefined : 'Not built yet in this stage'}
                className={`staff-tab${built ? ' is-active' : ''}`}>
                <Icon size={14} />{label}
              </button>
            ))}
          </div>

          <section className="staff-stats">
            <SummaryCard tone="blue" Icon={StaffIcon} label="Total Staff" value={summary?.totalStaff ?? '–'} />
            <SummaryCard tone="green" Icon={CheckCircleIcon} label="Active Staff" value={summary ? two(summary.activeStaff) : '–'} />
            <SummaryCard tone="red" Icon={XCircleIcon} label="Inactive Staff" value={summary ? two(summary.inactiveStaff) : '–'} />
            <SummaryCard tone="purple" Icon={StaffIcon} label="Staff on Duty" value={summary?.staffOnDuty ?? '–'} />
            <SummaryCard tone="blue" Icon={SunIcon} label="Active Shift" value={summary ? (summary.activeShift?.name ?? '–').toUpperCase() : '–'} />
          </section>

          {setupBanner}

          <section className="panel staff-panel">
            <div className="staff-panel__top">
              <h2>Staff Details</h2>
              <SearchInput value={query} onChange={updateQuery} placeholder="Search by staff id, name, role, phone, email...." />
              <FilterButton open={filterOpen} onClick={() => setFilterOpen(!filterOpen)} />
              <AddButton label="Add Staff" onClick={() => setScreen({ name: 'add' })} />
            </div>

            {filterOpen && (
              <div className="staff-filters">
                <FilterSelect label="Role" value={filters.role} list={names.roles} allLabel="All Roles" onChange={updateFilter('role')} />
                <FilterSelect label="Team" value={filters.team} list={names.teams} allLabel="All Teams" onChange={updateFilter('team')} />
                <FilterSelect label="Shift" value={filters.shift} list={names.shifts} allLabel="All Shift" onChange={updateFilter('shift')} />
                <FilterSelect label="Status" value={filters.status} list={['Active', 'Inactive']} allLabel="All Status" onChange={updateFilter('status')} />
                <ClearAllButton onClick={clearFilters} />
              </div>
            )}

            {problem && <ErrorState message={problem} />}
            {list.loading && !list.data && <LoadingState message="Loading staff..." />}
            {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
            {list.data && (
              <div className="gtable staff-table" style={{ '--cols': COLS }}>
                <div className="gtable__inner">
                  <div className="gtable__row gtable__head">
                    {COLUMNS.map((c) => <span key={c}>{c}</span>)}
                  </div>
                  {rows.length === 0 && <EmptyState message="No staff found" />}
                  {rows.map((s) => (
                    <div className="gtable__row" key={s.id}>
                      <span className="staff-cell">
                        <StaffAvatar staff={s} size={34} />
                        <span><strong>{s.name}</strong><small>{staffTag(s.code)}</small></span>
                      </span>
                      <span className="staff-cell staff-cell--stack"><strong>{s.role?.name ?? '-'}</strong><small>{s.team?.name ?? '-'}</small></span>
                      <span>{s.shift ? <ShiftBadge shift={s.shift.name} /> : '-'}</span>
                      <span className="staff-cell staff-cell--stack"><strong>{s.phone}</strong><span>{s.email}</span></span>
                      <span className="staff-cell staff-cell--stack"><span>-</span></span>
                      <span><StatusBadge active={s.active} /></span>
                      <span className="ptable__actions">
                        <button type="button" className="icon-btn icon-btn--green" aria-label={`View ${s.name}`} title="View"
                          onClick={() => setScreen({ name: 'details', id: s.id })}><EyeIcon size={15} /></button>
                        <button type="button" className="icon-btn icon-btn--orange" aria-label={`Edit ${s.name}`} title="Edit"
                          onClick={() => setScreen({ name: 'edit', id: s.id })}><EditIcon size={15} /></button>
                        <DeleteButton label={`Delete ${s.name}`} onClick={() => setDeleting(s)} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {list.data && <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.meta.total} onChange={setPage} label="staffs" />}
          </section>
        </>
      )}

      {screen.name === 'add' && (
        <>
          {setupBanner}
          {!needsSetup && listsReady && <AddStaff lists={names} isOwner={isOwner} onCancel={toList} onSave={addStaff} />}
          {needsSetup && <button type="button" className="btn btn-outline" onClick={toList}>Back</button>}
          {!listsReady && (rolesLoad.error || teamsLoad.error || shiftsLoad.error) && <ErrorState message={rolesLoad.error || teamsLoad.error || shiftsLoad.error} onRetry={reloadAll} />}
        </>
      )}

      {(screen.name === 'details' || screen.name === 'edit') && detail.loading && !current && <LoadingState message="Loading the staff record..." />}
      {(screen.name === 'details' || screen.name === 'edit') && detail.error && <ErrorState message={detail.error} onRetry={detail.reload} />}

      {(screen.name === 'details' || screen.name === 'edit') && current && (
        <StaffDetails key={`${current.id}-${screen.name}`} staff={current} lists={names} isOwner={isOwner} editing={screen.name === 'edit'}
          onClose={toList} onEdit={() => setScreen({ name: 'edit', id: current.id })}
          onCancelEdit={() => setScreen({ name: 'details', id: current.id })} onSave={saveEdit} />
      )}

      {deleting && (
        <ConfirmationModal message='Click "Delete" to remove this staff.' confirmLabel="Delete"
          onCancel={() => setDeleting(null)} onConfirm={confirmDelete}>
          <div className="modal__product"><StaffAvatar staff={deleting} size={24} />{deleting.name}</div>
        </ConfirmationModal>
      )}

      {toast && <SuccessModal key={toast.id} title={toast.title} message={toast.message} onClose={closeToast} />}
    </MainLayout>
  );
}
