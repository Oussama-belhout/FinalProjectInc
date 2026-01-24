import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap, catchError, of, map } from 'rxjs';
import { Router } from '@angular/router';

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  lastLogin?: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = '/api/auth';
  private tokenKey = 'auth_token';
  private userKey = 'auth_user';

  // Reactive signals for auth state
  private _currentUser = signal<User | null>(this.getUserFromStorage());
  private _isLoggedIn = signal<boolean>(this.hasValidToken());

  // Public computed signals
  readonly currentUser = this._currentUser.asReadonly();
  readonly isLoggedIn = this._isLoggedIn.asReadonly();
  readonly username = computed(() => this._currentUser()?.username || '');

  constructor(private http: HttpClient, private router: Router) {
    // Verify token on service initialization
    if (this.hasValidToken()) {
      this.verifyToken();
    }
  }

  /**
   * Login with email and password
   */
  login(credentials: LoginCredentials): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials).pipe(
      tap(response => {
        this.setAuthData(response.token, response.user);
      }),
      catchError(error => {
        console.error('Login failed:', error);
        throw error;
      })
    );
  }

  /**
   * Register a new user
   */
  register(credentials: RegisterCredentials): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, credentials).pipe(
      tap(response => {
        this.setAuthData(response.token, response.user);
      }),
      catchError(error => {
        console.error('Registration failed:', error);
        throw error;
      })
    );
  }

  /**
   * Logout the current user
   */
  logout(): void {
    const token = this.getToken();
    
    if (token) {
      // Call logout endpoint
      this.http.post(`${this.apiUrl}/logout`, {}, {
        headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
      }).subscribe({
        error: () => console.log('Logout API call failed, clearing local data anyway')
      });
    }

    this.clearAuthData();
    this.router.navigate(['/']);
  }

  /**
   * Verify the current token is still valid
   */
  verifyToken(): Observable<boolean> {
    const token = this.getToken();
    if (!token) {
      this.clearAuthData();
      return of(false);
    }

    return this.http.get<{ valid: boolean; user: User }>(`${this.apiUrl}/verify`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    }).pipe(
      map(response => {
        if (response.valid && response.user) {
          this._currentUser.set(response.user);
          this._isLoggedIn.set(true);
          this.setUser(response.user);
          return true;
        } else {
          this.clearAuthData();
          return false;
        }
      }),
      catchError(() => {
        this.clearAuthData();
        return of(false);
      })
    );
  }

  /**
   * Get current user from server
   */
  getCurrentUser(): Observable<User | null> {
    const token = this.getToken();
    if (!token) {
      return of(null);
    }

    return this.http.get<{ user: User }>(`${this.apiUrl}/me`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    }).pipe(
      map(response => {
        this._currentUser.set(response.user);
        this.setUser(response.user);
        return response.user;
      }),
      catchError(() => {
        this.clearAuthData();
        return of(null);
      })
    );
  }

  /**
   * Get the JWT token
   */
  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  /**
   * Get authorization headers for API requests
   */
  getAuthHeaders(): HttpHeaders {
    const token = this.getToken();
    if (token) {
      return new HttpHeaders({ Authorization: `Bearer ${token}` });
    }
    return new HttpHeaders();
  }

  /**
   * Check if user has a stored token
   */
  private hasValidToken(): boolean {
    return !!localStorage.getItem(this.tokenKey);
  }

  /**
   * Get user from localStorage
   */
  private getUserFromStorage(): User | null {
    const userStr = localStorage.getItem(this.userKey);
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Store auth data in localStorage
   */
  private setAuthData(token: string, user: User): void {
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.userKey, JSON.stringify(user));
    this._currentUser.set(user);
    this._isLoggedIn.set(true);
  }

  /**
   * Store user in localStorage
   */
  private setUser(user: User): void {
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  /**
   * Clear all auth data
   */
  private clearAuthData(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this._currentUser.set(null);
    this._isLoggedIn.set(false);
  }
}
