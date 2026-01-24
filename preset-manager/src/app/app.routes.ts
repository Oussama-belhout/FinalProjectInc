import { Routes } from '@angular/router';
import { PresetList } from './components/preset-list/preset-list';
import { PresetDetail } from './components/preset-detail/preset-detail';
import { PresetCreate } from './components/preset-create/preset-create';
import { LoginComponent } from './components/login/login';
import { authGuard, guestGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/presets', pathMatch: 'full' },
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'presets', component: PresetList, canActivate: [authGuard] },
  { path: 'presets/new', component: PresetCreate, canActivate: [authGuard] },
  { path: 'presets/edit/:id', component: PresetCreate, canActivate: [authGuard] },
  { path: 'presets/:id', component: PresetDetail, canActivate: [authGuard] }
];
