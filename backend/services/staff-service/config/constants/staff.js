// Option lists of the Staff Management designs (labels copied from the Figma).
const GENDERS = Object.freeze(['Male', 'Female', 'Others']);
const EMPLOYMENT_TYPES = Object.freeze(['Fulltime', 'Part time', 'Contract', 'Intern']);
const SALARY_TYPES = Object.freeze(['Monthly', 'Daily', 'Hourly']);
const PAYMENT_METHODS = Object.freeze(['Cash', 'Bank Transfer']);
const WEEKDAYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']); // the Figma's Mon..Sun
const DEFAULT_WORKING_DAYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri']); // pre-selected on the Add Staff form

const LEAVE_TYPES = Object.freeze({ hour_permission: 'Hour Permission', half_day: 'Half Day', full_day: 'Full Day' });
const HALVES = Object.freeze(['first', 'second']); // "First Half" / "Second Half"

const ATTENDANCE_STATUS = Object.freeze({
  ON_TIME: 'On Time', LATE: 'Late', HOUR_PERMISSION: 'Hour Permission', HALF_DAY: 'Half Day Leave', FULL_DAY: 'Full Day Leave', ABSENT: 'Absent',
});
// PENDING APPROVAL: the Figma has no grace period, so a check-in after the shift start is Late.
const LATE_GRACE_MINUTES = 0;

const REWARD_REASONS = Object.freeze([
  'Performance Bonus', 'Perfect Attendance', 'Customer Appreciation', 'Extra Shift / Overtime', 'Sales Target Bonus', 'Special Bonus', 'Other',
]);
const DEDUCTION_REASONS = Object.freeze([
  'Cash Shortage', 'Late / Early Leave', 'Damaged Item / Equipment', 'Order / Billing Error', 'Unpaid Leave', 'Salary Advance', 'Other',
]);
const PAYROLL_STATUS = Object.freeze({ PENDING: 'Pending', OVERDUE: 'Overdue', PAID: 'Paid' });

module.exports = {
  GENDERS, EMPLOYMENT_TYPES, SALARY_TYPES, PAYMENT_METHODS, WEEKDAYS, DEFAULT_WORKING_DAYS, LEAVE_TYPES, HALVES,
  ATTENDANCE_STATUS, LATE_GRACE_MINUTES, REWARD_REASONS, DEDUCTION_REASONS, PAYROLL_STATUS,
};
