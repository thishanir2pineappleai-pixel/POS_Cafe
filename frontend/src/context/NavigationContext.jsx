import { createContext, useContext } from 'react';

// Lets the shared Sidebar switch pages without a router library (none is installed yet).
export const NavigationContext = createContext(() => {});
export const useNavigate = () => useContext(NavigationContext);
