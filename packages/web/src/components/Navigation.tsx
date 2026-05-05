import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFamily } from '../hooks/useFamily';
import ThemeToggle from './ThemeToggle';
import WeekSelector from './WeekSelector';

export default function Navigation() {
    const { user, logout } = useAuth();
    const { familyId, families, switchFamily } = useFamily();
    const navigate = useNavigate();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const navLinks = familyId
        ? [
            { to: '/week', label: 'This Week' },
            { to: '/meals', label: 'Meals' },
            { to: '/grocery', label: 'Grocery' },
        ]
        : [];

    const linkClass = ({ isActive }: { isActive: boolean }) =>
        `px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
        }`;

    const handleLogout = async () => {
        setMenuOpen(false);
        await logout();
        navigate('/login');
    };

    const handleSwitchFamily = (id: string) => {
        switchFamily(id);
        setMenuOpen(false);
    };

    return (
        <nav
            className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40"
            aria-label="Main navigation"
        >
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex items-center justify-between h-14 gap-4">
                    {/* Left: logo */}
                    <Link to="/" className="text-lg font-bold text-gray-900 dark:text-gray-100 shrink-0">
                        🍽️ Meal Planner
                    </Link>

                    {/* Center: week selector */}
                    <div className="hidden md:flex flex-1 justify-center min-w-0">
                        {familyId && <WeekSelector />}
                    </div>

                    {/* Right: nav links + menu */}
                    <div className="hidden md:flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1 mr-1">
                            {navLinks.map(link => (
                                <NavLink key={link.to} to={link.to} className={linkClass}>
                                    {link.label}
                                </NavLink>
                            ))}
                        </div>
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setMenuOpen(!menuOpen)}
                                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                aria-expanded={menuOpen}
                                aria-haspopup="true"
                                aria-label="Open menu"
                            >
                                {user?.avatarUrl ? (
                                    <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">
                                        {user?.name?.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>

                            {menuOpen && (
                                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                                    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                        {user?.avatarUrl ? (
                                            <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full shrink-0" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-base font-medium shrink-0">
                                                {user?.name?.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user?.name}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
                                        </div>
                                    </div>

                                    {families.length > 1 && (
                                        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Family</p>
                                            <select
                                                value={familyId ?? ''}
                                                onChange={e => handleSwitchFamily(e.target.value)}
                                                className="w-full text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                aria-label="Select family"
                                            >
                                                {families.map(f => (
                                                    <option key={f.id} value={f.id}>{f.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Theme</p>
                                        <ThemeToggle variant="menu" />
                                    </div>

                                    {familyId && (
                                        <Link
                                            to="/family/settings"
                                            className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                                            onClick={() => setMenuOpen(false)}
                                        >
                                            Family settings
                                        </Link>
                                    )}
                                    <button
                                        onClick={handleLogout}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                                    >
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mobile actions */}
                    <div className="md:hidden flex items-center gap-1">
                        <button
                            className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                            onClick={() => setMobileOpen(!mobileOpen)}
                            aria-expanded={mobileOpen}
                            aria-label="Toggle navigation menu"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {mobileOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                )}
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Mobile week selector row, always visible if family present */}
                {familyId && (
                    <div className="md:hidden border-t border-gray-100 dark:border-gray-800 py-2">
                        <WeekSelector variant="mobile" />
                    </div>
                )}
            </div>

            {/* Mobile menu */}
            {mobileOpen && (
                <div className="md:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <div className="px-4 py-3 flex flex-wrap justify-center gap-1">
                        {navLinks.map(link => (
                            <NavLink
                                key={link.to}
                                to={link.to}
                                className={linkClass}
                                onClick={() => setMobileOpen(false)}
                            >
                                {link.label}
                            </NavLink>
                        ))}
                    </div>

                    {families.length > 1 && (
                        <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-3">
                            <label className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Family</label>
                            <select
                                value={familyId ?? ''}
                                onChange={e => switchFamily(e.target.value)}
                                className="w-full text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1"
                            >
                                {families.map(f => (
                                    <option key={f.id} value={f.id}>{f.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Theme</p>
                        <ThemeToggle variant="menu" />
                    </div>

                    <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2 py-1">
                            {user?.avatarUrl ? (
                                <img src={user.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                            ) : (
                                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-medium">
                                    {user?.name?.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <span className="text-sm text-gray-700 dark:text-gray-200">{user?.name}</span>
                        </div>
                        {familyId && (
                            <NavLink
                                to="/family/settings"
                                className="block text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                                onClick={() => setMobileOpen(false)}
                            >
                                Family settings
                            </NavLink>
                        )}
                        <button
                            onClick={handleLogout}
                            className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            )}
        </nav>
    );
}
