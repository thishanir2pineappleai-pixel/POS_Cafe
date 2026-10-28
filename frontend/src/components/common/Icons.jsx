// Inline SVG icons (no icon library is installed). Colour comes from `currentColor`.
const stroke = (children) =>
  function Icon({ size = 18, ...rest }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
        {children}
      </svg>
    );
  };

const solid = (children) =>
  function Icon({ size = 18, ...rest }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
        {children}
      </svg>
    );
  };

// Navigation
export const DashboardIcon = solid(<>
  <rect x="3" y="3" width="8" height="10" rx="2" /><rect x="13" y="3" width="8" height="6" rx="2" />
  <rect x="3" y="15" width="8" height="6" rx="2" /><rect x="13" y="11" width="8" height="10" rx="2" />
</>);
export const StaffIcon = solid(<>
  <circle cx="12" cy="6" r="3" /><path d="M6 18a6 6 0 0 1 12 0z" /><rect x="3" y="19.5" width="18" height="2" rx="1" />
</>);
export const CupIcon = solid(<>
  <path d="M3 8h13v6a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z" />
  <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" fill="none" stroke="currentColor" strokeWidth="2" />
</>);
export const SalesIcon = solid(<>
  <circle cx="12" cy="12" r="10" />
  <path d="M12 6.5v11M15 9.5c0-1.2-1.3-1.9-3-1.9s-3 .7-3 1.9 1.3 1.7 3 2.1 3 .9 3 2.100-1.300 2-3 2-3-.7-3-2"
    fill="none" style={{ stroke: 'var(--hole, #fff)' }} strokeWidth="1.7" strokeLinecap="round" />
</>);
export const InventoryIcon = solid(<>
  <rect x="4" y="3" width="16" height="18" rx="2" />
  <path d="M8 8h2M8 12h2M8 16h2M13 8h3M13 12h3M13 16h3" style={{ stroke: 'var(--hole, #fff)' }} strokeWidth="1.6" strokeLinecap="round" />
</>);
export const CustomersIcon = solid(<>
  <circle cx="9" cy="7" r="3.2" /><path d="M2.5 20a6.500 6.500 0 0 1 13 0z" />
  <circle cx="17.500" cy="8" r="2.600" /><path d="M17 13.500a5.500 5.500 0 0 1 5 6.500h-4.500z" />
</>);
export const SettingsIcon = solid(<>
  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="2.8 2.8" />
  <circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="3" style={{ fill: 'var(--hole, #fff)' }} />
</>);

// Actions and controls
export const SearchIcon = stroke(<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.650" y2="16.650" /></>);
export const FilterIcon = stroke(<polygon points="22 3 2 3 10 12.460 10 19 14 21 14 12.460 22 3" />);
export const PlusIcon = stroke(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>);
export const EyeIcon = stroke(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>);
export const EditIcon = stroke(<><path d="M12 20h9" /><path d="M16.500 3.500a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.500 3.500z" /></>);
export const TrashIcon = stroke(<>
  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
</>);
export const UploadIcon = stroke(<>
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
</>);
export const CheckCircleIcon = stroke(<><path d="M22 11.080V12a10 10 0 1 1-5.930-9.140" /><polyline points="22 4 12 14.010 9 11.010" /></>);
export const XCircleIcon = stroke(<><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>);
export const CloseIcon = stroke(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>);
export const ChevronDownIcon = stroke(<polyline points="6 9 12 15 18 9" />);
export const ChevronUpIcon = stroke(<polyline points="18 15 12 9 6 15" />);
export const ChevronLeftIcon = stroke(<polyline points="15 18 9 12 15 6" />);
export const ChevronRightIcon = stroke(<polyline points="9 18 15 12 9 6" />);
export const ArrowLeftIcon = stroke(<><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>);
export const LogoutIcon = stroke(<>
  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
</>);
export const UserIcon = stroke(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);

// Settings module
export const TriangleDownIcon = solid(<path d="M7 10l5 5 5-5z" />);
export const TriangleUpIcon = solid(<path d="M7 14l5-5 5 5z" />);
export const EyeOffIcon = stroke(<>
  <path d="M17.940 17.940A10.070 10.070 0 0 1 12 20c-7 0-11-8-11-8a18.450 18.450 0 0 1 5.060-5.940M9.900 4.240A9.120 9.120 0 0 1 12 4c7 0 11 8 11 8a18.500 18.500 0 0 1-2.160 3.190m-6.720-1.070a3 3 0 1 1-4.240-4.240" />
  <line x1="1" y1="1" x2="23" y2="23" />
</>);
export const EditSquareIcon = stroke(<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.500 2.500a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.500-9.500z" /></>);
export const CameraIcon = stroke(<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>);
export const PinIcon = stroke(<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>);
export const PhoneIcon = stroke(<path d="M22 16.920v3a2 2 0 0 1-2.180 2 19.790 19.790 0 0 1-8.630-3.070 19.500 19.500 0 0 1-6-6 19.790 19.790 0 0 1-3.070-8.670A2 2 0 0 1 4.110 2h3a2 2 0 0 1 2 1.720 12.840 12.840 0 0 0 .7 2.810 2 2 0 0 1-.45 2.110L8.090 9.910a16 16 0 0 0 6 6l1.270-1.270a2 2 0 0 1 2.110-.45 12.840 12.840 0 0 0 2.810.7A2 2 0 0 1 22 16.920z" />);
export const MailIcon = stroke(<><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22 6 12 13 2 6" /></>);
export const GlobeIcon = stroke(<><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.300 15.300 0 0 1 4 10 15.300 15.300 0 0 1-4 10 15.300 15.300 0 0 1-4-10 15.300 15.300 0 0 1 4-10z" /></>);
export const ClockIcon = stroke(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>);

// Sales module
export const CalendarIcon = stroke(<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>);
export const RefreshIcon = stroke(<><polyline points="23 4 23 10 17 10" /><path d="M20.490 15a9 9 0 1 1-2.120-9.360L23 10" /></>);
export const ArrowRightIcon = stroke(<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>);
export const TicketIcon = stroke(<>
  <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
  <path d="M13 5v2M13 17v2M13 11v2" />
</>);
export const BadgePercentIcon = stroke(<>
  <path d="M3.850 8.620a4 4 0 0 1 4.780-4.770 4 4 0 0 1 6.740 0 4 4 0 0 1 4.780 4.780 4 4 0 0 1 0 6.740 4 4 0 0 1-4.770 4.780 4 4 0 0 1-6.750 0 4 4 0 0 1-4.780-4.770 4 4 0 0 1 0-6.760Z" />
  <path d="m15 9-6 6M9 9h.01M15 15h.01" />
</>);
export const BoxOutlineIcon = stroke(<>
  <path d="M21 16V8a2 2 0 0 0-1-1.730l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.730l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  <polyline points="3.270 6.960 12 12.010 20.730 6.960" /><line x1="12" y1="22.080" x2="12" y2="12" />
</>);

// Auth and Dashboard screens
export const AlertCircleIcon = stroke(<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.010" y2="16" /></>);
export const CheckIcon = stroke(<polyline points="20 6 9 17 4 12" />);
export const AtSignIcon = stroke(<><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.920 7.940" /></>);
export const BookOpenIcon = stroke(<><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>);
export const HelpCircleIcon = stroke(<><circle cx="12" cy="12" r="10" /><path d="M9.090 9a3 3 0 0 1 5.830 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.010" y2="17" /></>);
export const MessageCircleIcon = stroke(<path d="M21 11.500a8.380 8.380 0 0 1-.9 3.800 8.500 8.500 0 0 1-7.600 4.700 8.380 8.380 0 0 1-3.800-.9L3 21l1.900-5.700a8.380 8.380 0 0 1-.9-3.800 8.500 8.500 0 0 1 4.700-7.600 8.380 8.380 0 0 1 3.800-.9h.5a8.480 8.480 0 0 1 8 8v.5z" />);
export const ArrowUpRightIcon = stroke(<><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></>);
export const CashIcon = stroke(<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.500" /><path d="M6 12h.01M18 12h.01" /></>);
export const BagIcon = stroke(<><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>);
export const BagCheckIcon = stroke(<><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><polyline points="9 14 11.500 16.500 15.500 12" /></>);
export const UserPlusIcon = stroke(<><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.500" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></>);
export const ChefHatIcon = stroke(<><path d="M17 21a1 1 0 0 0 1-1v-5.350c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z" /><path d="M6 17h12" /></>);

// Summary cards
export const BoxIcon = stroke(<>
  <path fill="currentColor" d="M21 16V8a2 2 0 0 0-1-1.730l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.730l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  <polyline stroke="#fff" points="3.270 6.960 12 12.010 20.730 6.960" /><line stroke="#fff" x1="12" y1="22.080" x2="12" y2="12" />
</>);
export const CategoriesIcon = stroke(<>
  <rect x="3" y="3" width="7" height="7" rx="1.500" /><rect x="14" y="3" width="7" height="7" rx="1.500" />
  <rect x="3" y="14" width="7" height="7" rx="1.500" /><circle cx="17.500" cy="17.500" r="3.500" />
</>);

// Staff Management
export const SunIcon = stroke(<>
  <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.930 4.930l1.410 1.410M17.660 17.660l1.410 1.410M2 12h2M20 12h2M4.930 19.070l1.410-1.410M17.660 6.340l1.410-1.410" />
</>);
export const ShieldIcon = stroke(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />);
export const ActivityIcon = stroke(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />);
export const FileTextIcon = stroke(<>
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
  <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
</>);
export const UploadCloudIcon = stroke(<>
  <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
  <path d="M20.390 18.390A5 5 0 0 0 18 9h-1.260A8 8 0 1 0 3 16.300" />
</>);
