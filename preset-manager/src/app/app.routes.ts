import { Routes } from '@angular/router';
import { PresetList } from './components/preset-list/preset-list';
import { PresetDetail } from './components/preset-detail/preset-detail';

export const routes: Routes = [
  { path: '', redirectTo: '/presets', pathMatch: 'full' },
  { path: 'presets', component: PresetList },
  { path: 'presets/:id', component: PresetDetail }
];
