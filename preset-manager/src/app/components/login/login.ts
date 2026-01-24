import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
})
export class LoginComponent {
  // Tab state
  activeTab = signal<'login' | 'register'>('login');

  // Form fields
  loginEmail = '';
  loginPassword = '';
  registerUsername = '';
  registerEmail = '';
  registerPassword = '';

  // UI state
  isLoading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    // Redirect if already logged in
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/']);
    }
  }

  setActiveTab(tab: 'login' | 'register'): void {
    this.activeTab.set(tab);
    this.clearMessages();
  }

  clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  onLogin(): void {
    if (!this.loginEmail || !this.loginPassword) {
      this.errorMessage.set('Please fill in all fields');
      return;
    }

    this.isLoading.set(true);
    this.clearMessages();

    this.authService.login({
      email: this.loginEmail,
      password: this.loginPassword
    }).subscribe({
      next: () => {
        this.successMessage.set('Login successful! Redirecting...');
        setTimeout(() => {
          this.router.navigate(['/']);
        }, 1000);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.error || 'Login failed. Please try again.');
      }
    });
  }

  onRegister(): void {
    if (!this.registerUsername || !this.registerEmail || !this.registerPassword) {
      this.errorMessage.set('Please fill in all fields');
      return;
    }

    if (this.registerPassword.length < 6) {
      this.errorMessage.set('Password must be at least 6 characters');
      return;
    }

    this.isLoading.set(true);
    this.clearMessages();

    this.authService.register({
      username: this.registerUsername,
      email: this.registerEmail,
      password: this.registerPassword
    }).subscribe({
      next: () => {
        this.successMessage.set('Account created! Redirecting...');
        setTimeout(() => {
          this.router.navigate(['/']);
        }, 1000);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.error || 'Registration failed. Please try again.');
      }
    });
  }

  goBack(): void {
    window.location.href = '/home.html';
  }
}
