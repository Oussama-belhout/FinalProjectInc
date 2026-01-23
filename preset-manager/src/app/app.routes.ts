import { Routes } from '@angular/router';
import { PresetList } from './components/preset-list/preset-list';
import { PresetDetail } from './components/preset-detail/preset-detail';
import { PresetCreate } from './components/preset-create/preset-create';

export const routes: Routes = [
  { path: '', redirectTo: '/presets', pathMatch: 'full' },
  { path: 'presets', component: PresetList },
  { path: 'presets/new', component: PresetCreate },
  { path: 'presets/edit/:id', component: PresetCreate },
  { path: 'presets/:id', component: PresetDetail }
];
