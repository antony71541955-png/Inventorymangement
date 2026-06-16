import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Boxes, 
  RefreshCw, 
  FileSpreadsheet, 
  BarChart3, 
  LogOut, 
  Layers,
  Menu,
  Search,
  Settings,
  HelpCircle,
  Bell,
  MoreHorizontal,
  MapPin,
  User,
  History
} from 'lucide-react';

import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import StockTransfer from './pages/StockTransfer';
import ExcelDeduction from './pages/ExcelDeduction';
import Reports from './pages/Reports';
import Login from './pages/Login';
import Locations from './pages/Locations';
import Users from './pages/Users';
import AuditLogs from './pages/AuditLogs';

// Constants — uses VITE_API_URL env var in production (set in Render dashboard)
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Auth Context
interface AuthUser {
  username: string;
  full_name: string;
  role: string;
}

interface AuthContextType {
  token: string | null;
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// Route Guard
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<AuthUser | null>(
    localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null
  );

  const login = (newToken: string, newUser: AuthUser) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  // Setup Global Fetch Interceptor to include JWT token
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        init = init || {};
        init.headers = {
          ...init.headers,
          'Authorization': `Bearer ${storedToken}`,
        };
      }
      return originalFetch(input, init);
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

// Global Layout with responsive navigation (Desktop Sidebar / Mobile Drawer)
function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [openMobileMenu, setOpenMobileMenu] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
    logout();
  };

  const baseMenuItems = [
    { path: '/', name: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { path: '/inventory', name: 'Inventory', icon: <Boxes size={16} /> },
    { path: '/transfer', name: 'Stock Transfer', icon: <RefreshCw size={16} /> },
    { path: '/deduction', name: 'Excel Deduction', icon: <FileSpreadsheet size={16} /> },
    { path: '/reports', name: 'Reports & Logs', icon: <BarChart3 size={16} /> },
    { path: '/locations', name: 'Locations Setup', icon: <MapPin size={16} /> },
  ];

  const menuItems = user?.role === 'superadmin' ? [
    ...baseMenuItems,
    { path: '/users', name: 'User Management', icon: <User size={16} /> },
    { path: '/audit-logs', name: 'Audit Logs', icon: <History size={16} /> }
  ] : baseMenuItems;

  const sidebarFooterItems = [
    // { name: 'Notifications', icon: <Bell size={16} />, badge: '?' },
    // { name: 'Help & Support', icon: <HelpCircle size={16} /> },
    // { name: 'Settings', icon: <Settings size={16} /> },
  ];

  // Navigation link renderer
  const renderNavLinks = (onClickCallback?: () => void) => (
    <div className="flex flex-col gap-1.5 mt-2">
      {menuItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onClickCallback}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-medium transition-all ${
              isActive 
                ? 'bg-[#1e2536] text-white' 
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
            }`}
          >
            {item.icon}
            <span>{item.name}</span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-100 flex text-zinc-900">
      {/* 1. DESKTOP SIDEBAR (Visible on screens lg and above) */}
      <aside className="hidden lg:flex w-60 bg-[#0e121e] text-zinc-400 border-r border-zinc-800/20 flex-col p-5 fixed h-screen z-50 justify-between">
        <div>
          <div className="flex items-center justify-between text-zinc-100 font-bold text-sm tracking-wide mb-6">
            <div className="flex items-center gap-2">
              <Layers className="text-zinc-100" size={18} />
              <span>Inventory Management</span>
            </div>
            <button className="text-zinc-500 hover:text-zinc-300">
              <span className="text-xs">⇥</span>
            </button>
          </div>

          {/* Capsule Search Input */}
          {/* <div className="relative mb-5">
            <Search className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <input 
              type="text" 
              className="w-full bg-[#181d2c] border border-transparent rounded-full py-2 pl-9 pr-8 text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-750"
              placeholder="Search"
            />
            <span className="absolute right-3.5 top-2.5 text-[9px] text-zinc-600 font-mono">⌘F</span>
          </div> */}

          <nav>
            {renderNavLinks()}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="space-y-4 pt-4 border-t border-zinc-800/40">
          <div className="flex flex-col gap-1">
            {sidebarFooterItems.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between px-3.5 py-2 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 cursor-pointer">
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className="w-4.5 h-4.5 rounded-full bg-red-600 text-white text-[9px] flex items-center justify-center font-bold">
                    {item.badge}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-zinc-800/45 pt-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-sm">
                {user?.full_name?.charAt(0) || 'U'}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-zinc-200 truncate leading-tight">{user?.full_name || 'Olivia Williams'}</span>
                <span className="text-[9px] font-medium text-zinc-500 truncate mt-0.5">{user?.username || 'olivia@wms.com'}</span>
              </div>
            </div>
            <button className="text-zinc-500 hover:text-zinc-300" onClick={handleLogout}>
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-60">
        {/* MOBILE TOP NAVBAR (Visible on screens < lg) */}
        <header className="lg:hidden flex items-center justify-between px-6 py-3 border-b border-zinc-200 bg-white sticky top-0 z-40">
          <div className="flex items-center gap-2 font-bold text-sm text-zinc-900">
            <Layers className="text-indigo-600" size={18} />
            <span>Inventory Management</span>
          </div>

          <Sheet open={openMobileMenu} onOpenChange={setOpenMobileMenu}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="border border-zinc-200 hover:bg-zinc-100">
                <Menu size={18} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-[#0e121e] border-r border-zinc-800 text-zinc-400 flex flex-col p-5 w-64 justify-between">
              <div>
                <SheetHeader className="text-left border-b border-zinc-850 pb-4 mb-4">
                  <SheetTitle className="flex items-center gap-2.5 text-sm font-bold text-zinc-100">
                    <Layers className="text-indigo-500" size={20} />
                    <span>Inventory Management</span>
                  </SheetTitle>
                </SheetHeader>
                
                {/* Mobile Capsule Search */}
                <div className="relative mb-5">
                  <Search className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                  <input 
                    type="text" 
                    className="w-full bg-[#181d2c] border border-transparent rounded-full py-2 pl-9 pr-4 text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none"
                    placeholder="Search"
                  />
                </div>

                <nav>
                  {renderNavLinks(() => setOpenMobileMenu(false))}
                </nav>
              </div>

              <div className="space-y-4 pt-4 border-t border-zinc-800/40">
                <div className="flex flex-col gap-1">
                  {sidebarFooterItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3.5 py-2 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 cursor-pointer">
                      <div className="flex items-center gap-3">
                        {item.icon}
                        <span>{item.name}</span>
                      </div>
                      {item.badge && (
                        <span className="w-4.5 h-4.5 rounded-full bg-red-600 text-white text-[9px] flex items-center justify-center font-bold">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-zinc-800/45 pt-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-xs shrink-0">
                      {user?.full_name?.charAt(0) || 'U'}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-zinc-200 truncate leading-tight">{user?.full_name || 'Olivia Williams'}</span>
                      <span className="text-[9px] font-medium text-zinc-500 truncate mt-0.5">{user?.username || 'olivia@wms.com'}</span>
                    </div>
                  </div>
                  <button className="text-zinc-400 hover:text-zinc-200" onClick={() => { setOpenMobileMenu(false); handleLogout(); }}>
                    <LogOut size={14} />
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        {/* PAGE SCREEN CONTENT */}
        <main className="flex-1 p-6 md:p-8 min-w-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/transfer" element={<StockTransfer />} />
            <Route path="/deduction" element={<ExcelDeduction />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/locations" element={<Locations />} />
            {user?.role === 'superadmin' && (
              <>
                <Route path="/users" element={<Users />} />
                <Route path="/audit-logs" element={<AuditLogs />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
