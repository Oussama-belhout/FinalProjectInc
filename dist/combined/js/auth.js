/**
 * SampleStudio Authentication Service
 * Handles all authentication-related functionality
 */

const Auth = {
    // Token management
    setToken: (token) => localStorage.setItem('auth_token', token),
    getToken: () => localStorage.getItem('auth_token'),
    removeToken: () => localStorage.removeItem('auth_token'),

    // User management
    setUser: (user) => localStorage.setItem('auth_user', JSON.stringify(user)),
    getUser: () => {
        const user = localStorage.getItem('auth_user');
        return user ? JSON.parse(user) : null;
    },
    removeUser: () => localStorage.removeItem('auth_user'),

    // Auth state
    isLoggedIn: () => !!localStorage.getItem('auth_token'),

    // Clear all auth data
    logout: async () => {
        const token = Auth.getToken();
        if (token) {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (e) {
                console.log('Logout API call failed, clearing local data anyway');
            }
        }
        Auth.removeToken();
        Auth.removeUser();
    },

    // Login user
    login: async (email, password) => {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Login failed');
        }

        Auth.setToken(data.token);
        Auth.setUser(data.user);
        return data.user;
    },

    // Register user
    register: async (username, email, password) => {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Registration failed');
        }

        Auth.setToken(data.token);
        Auth.setUser(data.user);
        return data.user;
    },

    // Verify current token
    verify: async () => {
        const token = Auth.getToken();
        if (!token) return false;

        try {
            const res = await fetch('/api/auth/verify', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            return data.valid === true;
        } catch (e) {
            return false;
        }
    },

    // Get current user from server
    getCurrentUser: async () => {
        const token = Auth.getToken();
        if (!token) return null;

        try {
            const res = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!res.ok) {
                Auth.logout();
                return null;
            }

            const data = await res.json();
            Auth.setUser(data.user);
            return data.user;
        } catch (e) {
            return null;
        }
    },

    // Get authorization header for API requests
    getAuthHeader: () => {
        const token = Auth.getToken();
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    },

    // Redirect to login if not authenticated
    requireAuth: (redirectUrl = null) => {
        if (!Auth.isLoggedIn()) {
            const currentPath = redirectUrl || window.location.pathname;
            window.location.href = `/login.html?redirect=${encodeURIComponent(currentPath)}`;
            return false;
        }
        return true;
    },

    // UI Helper: Update navigation with auth state
    updateNavigation: () => {
        const authNavContainer = document.getElementById('auth-nav');
        if (!authNavContainer) return;

        const user = Auth.getUser();
        
        if (Auth.isLoggedIn() && user) {
            authNavContainer.innerHTML = `
                <div class="user-menu">
                    <button class="user-menu-btn" id="user-menu-btn">
                        <div class="user-avatar">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                <circle cx="12" cy="7" r="4"/>
                            </svg>
                        </div>
                        <span class="user-name">${user.username}</span>
                        <svg class="dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </button>
                    <div class="user-dropdown" id="user-dropdown">
                        <div class="dropdown-header">
                            <span class="dropdown-username">${user.username}</span>
                            <span class="dropdown-email">${user.email}</span>
                        </div>
                        <div class="dropdown-divider"></div>
                        <a href="/manager" class="dropdown-item">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>
                                <path d="M19 12H5"/>
                                <path d="M12 17l5-5-5-5"/>
                            </svg>
                            Preset Manager
                        </a>
                        <button class="dropdown-item logout-btn" id="logout-btn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                                <polyline points="16 17 21 12 16 7"/>
                                <line x1="21" y1="12" x2="9" y2="12"/>
                            </svg>
                            Sign Out
                        </button>
                    </div>
                </div>
            `;

            // Setup dropdown toggle
            const menuBtn = document.getElementById('user-menu-btn');
            const dropdown = document.getElementById('user-dropdown');
            const logoutBtn = document.getElementById('logout-btn');

            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('show');
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', () => {
                dropdown.classList.remove('show');
            });

            // Logout handler
            logoutBtn.addEventListener('click', async () => {
                await Auth.logout();
                window.location.reload();
            });
        } else {
            authNavContainer.innerHTML = `
                <a href="/login.html" class="auth-btn login-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                        <polyline points="10 17 15 12 10 7"/>
                        <line x1="15" y1="12" x2="3" y2="12"/>
                    </svg>
                    Sign In
                </a>
            `;
        }
    }
};

// Initialize auth state check on page load
document.addEventListener('DOMContentLoaded', () => {
    Auth.updateNavigation();
    
    // Verify token is still valid
    if (Auth.isLoggedIn()) {
        Auth.verify().then(valid => {
            if (!valid) {
                Auth.logout();
                Auth.updateNavigation();
            }
        });
    }
});

// Export for use in other scripts
window.Auth = Auth;
