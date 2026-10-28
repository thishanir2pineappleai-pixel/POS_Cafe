// A product's picture URL from the API, or the bundled sample photo when the product has none yet.
import fallback from '../assets/images/ice-coffee.png';
import { uploadUrl } from './client.js';

export const productImage = (url) => uploadUrl(url) ?? fallback;
