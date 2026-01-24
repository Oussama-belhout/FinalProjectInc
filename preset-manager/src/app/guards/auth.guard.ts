import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

/**
 * Auth guard to protect routes that require authentication.
 * Redirects to login page if user is not authenticated.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) {
    return true;
  }

  // Store the attempted URL for redirecting after login
  const returnUrl = state.url;
  
  // Redirect to login page on the vanilla JS side
  // Since we're using hash routing in Angular, we need to handle this differently
  window.location.href = `/login.html?redirect=/manager${returnUrl}`;
  
  return false;
};

/**
 * Guest guard to protect routes that should only be accessible to non-authenticated users.
 * Redirects to home if user is already authenticated.
 */
export const guestGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isLoggedIn()) {
    return true;
  }

  // User is already logged in, redirect to preset list
  router.navigate(['/']);
  return false;
};
