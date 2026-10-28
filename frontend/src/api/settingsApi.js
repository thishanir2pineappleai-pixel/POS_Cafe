// Fixed lists of the Settings Service.
import { request } from './client.js';

export const listTimezones = (signal) => request('GET', '/settings/timezones', { signal }); // -> ['(GMT +05:30) India / Colombo', ...]
