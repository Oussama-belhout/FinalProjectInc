import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { PresetService } from '../../services/preset';
import { PresetSummary } from '../../models/preset';

@Component({
  selector: 'app-preset-list',
  imports: [CommonModule, RouterLink],
  templateUrl: './preset-list.html',
  styleUrl: './preset-list.scss',
})
export class PresetList implements OnInit {
  presets: PresetSummary[] = [];
  groupedPresets: { [category: string]: PresetSummary[] } = {};
  loading = true;
  error: string | null = null;

  // Category icons (text labels for professional UI)
  categoryIcons: { [key: string]: string } = {
    'Drums': 'DR',
    'Electronic': 'EL',
    'Percussion': 'PE',
    'FX': 'FX',
    'Vocals': 'VO',
    'Bass': 'BA',
    'Synth': 'SY',
    'World': 'WO',
    'Custom': 'CU',
    'Uncategorized': '--'
  };

  constructor(
    private presetService: PresetService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    console.log('PresetList ngOnInit - loading presets...');
    this.loadPresets();
  }

  loadPresets(): void {
    this.loading = true;
    this.error = null;
    console.log('loadPresets() called');
    
    this.presetService.getPresets().subscribe({
      next: (presets) => {
        console.log('Presets received:', presets);
        this.presets = presets;
        this.groupByCategory();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading presets:', err);
        this.error = 'Failed to load presets. Make sure the backend server is running on port 3000.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  groupByCategory(): void {
    this.groupedPresets = {};
    this.presets.forEach(preset => {
      const category = preset.category || 'Uncategorized';
      if (!this.groupedPresets[category]) {
        this.groupedPresets[category] = [];
      }
      this.groupedPresets[category].push(preset);
    });
  }

  getCategoryIcon(category: string): string {
    return this.categoryIcons[category] || '--';
  }

  get categories(): string[] {
    return Object.keys(this.groupedPresets).sort();
  }

  navigateToPreset(id: string): void {
    this.router.navigate(['/presets', id]);
  }

  editPreset(preset: PresetSummary, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/presets/edit', preset.id]);
  }

  deletePreset(preset: PresetSummary, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    
    if (confirm(`Are you sure you want to delete "${preset.name}"?`)) {
      this.presetService.deletePreset(preset.id).subscribe({
        next: () => {
          this.loadPresets();
        },
        error: (err) => {
          alert('Failed to delete preset');
          console.error('Error deleting preset:', err);
        }
      });
    }
  }
}
