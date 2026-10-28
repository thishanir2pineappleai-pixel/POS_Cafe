// Option lists and display helpers of the Staff Management screens (the lists are the ones drawn in the Figma). The staff
// themselves, and the roles, teams and shifts they belong to, come from the Staff Service (api/staffApi.js).
export const PAGE_SIZE = 7;

export const GENDERS = ['Male', 'Female', 'Others'];
export const EMPLOYMENT_TYPES = ['Fulltime', 'Part time', 'Contract', 'Intern'];
export const SALARY_TYPES = ['Monthly', 'Daily', 'Hourly'];
export const PAYMENT_METHODS = ['Cash', 'Bank Transfer'];
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const DOCUMENT_SLOTS = [
  { key: 'cv', label: 'CV/Resume', viewLabel: 'CV/Resume', hint: 'PDF, DOC (Max 5MB)', accept: '.pdf,.doc,.docx', types: ['pdf', 'doc', 'docx'] },
  { key: 'idCopy', label: 'ID Copy', viewLabel: 'NIC Copy', hint: 'JPG, PNG, PDF (Max 5MB)', accept: '.jpg,.jpeg,.png,.pdf', types: ['jpg', 'jpeg', 'png', 'pdf'] },
  { key: 'agreement', label: 'Employment Agreement', viewLabel: 'Employment Contract', hint: 'Signed PDF (Max 5MB)', accept: '.pdf', types: ['pdf'] },
];
export const MAX_DOC_BYTES = 5 * 1024 * 1024;

export const staffTag = (code) => `#${code}`; // #STF0012: how the list and the detail page show the server's code

export const formatMoney = (n) => Number(String(n).replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const blankStaff = () => ({
  name: '', gender: '', avatar: null, avatarFile: null, imageName: '', phone: '', email: '', nic: '', dob: '', address: '',
  emergency: { name: '', relationship: '', phone: '' },
  joinDate: '', role: '', team: '', employmentType: '', active: true, inactiveReason: '',
  shift: '', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], hoursPerWeek: '',
  username: '', password: '',
  salary: { type: 'Monthly', basic: '', overtime: false, otRate: '', method: '', bank: '', account: '' },
  epf: { allowed: false, employerNumber: '', employeeNumber: '', employeeRate: 8, employerRate: 12, etfRate: 3 },
  docs: { cv: null, idCopy: null, agreement: null },
});

// PENDING APPROVAL: a new account has no roles, teams or shifts, and the Roles / Shift screens are not designed yet. The owner can
// create these starting sets in one click (Staff Management). The names are the Figma's option lists; the shift hours are placeholders.
export const DEFAULT_ROLES = ['Cashier', 'Manager', 'Waiter', 'Kitchen Staff', 'Supervisor', 'Chef', 'Cleaner'];
export const DEFAULT_TEAMS = ['Management', 'Service', 'Cleaning', 'Cooking'];
export const DEFAULT_SHIFTS = [
  { name: 'Morning', startTime: '06:00', endTime: '14:00' },
  { name: 'Evening', startTime: '14:00', endTime: '22:00' },
  { name: 'Night', startTime: '22:00', endTime: '06:00' },
];
