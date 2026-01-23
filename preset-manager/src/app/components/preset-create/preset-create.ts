import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { PresetService } from '../../services/preset';
import { Preset } from '../../models/preset';

@Component({
    selector: 'app-preset-create',
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './preset-create.html',
    styleUrl: './preset-create.scss'
})
export class PresetCreate implements OnInit {
    preset: Partial<Preset> = {
        name: '',
        category: 'Custom',
        description: '',
        sounds: []
    };

    isEditMode = false;
    isLoading = false;
    error: string | null = null;

    categories = [
        'Drums', 'Electronic', 'Percussion', 'FX',
        'Vocals', 'Bass', 'Synth', 'World', 'Custom'
    ];

    newSound = {
        pad: 0,
        name: '',
        url: ''
    };

    constructor(
        private presetService: PresetService,
        private router: Router,
        private route: ActivatedRoute
    ) { }

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            this.isEditMode = true;
            this.loadPreset(id);
        }
    }

    loadPreset(id: string): void {
        this.isLoading = true;
        this.presetService.getPreset(id).subscribe({
            next: (data) => {
                this.preset = data;
                // Ensure sounds array exists
                if (!this.preset.sounds) {
                    this.preset.sounds = [];
                }
                this.isLoading = false;
            },
            error: (err) => {
                this.error = 'Failed to load preset';
                this.isLoading = false;
                console.error(err);
            }
        });
    }

    addSound(): void {
        if (!this.newSound.name || !this.newSound.url) {
            alert('Please provide both a name and a URL for the sound.');
            return;
        }

        if (this.newSound.pad < 0 || this.newSound.pad > 15) {
            alert('Pad number must be between 0 and 15.');
            return;
        }

        // Check if pad is already taken
        const existingIndex = this.preset.sounds?.findIndex(s => s.pad === this.newSound.pad);
        if (existingIndex !== undefined && existingIndex >= 0) {
            if (!confirm(`Pad ${this.newSound.pad} is already taken. Overwrite?`)) {
                return;
            }
            // Remove existing
            this.preset.sounds?.splice(existingIndex, 1);
        }

        if (!this.preset.sounds) {
            this.preset.sounds = [];
        }

        this.preset.sounds.push({ ...this.newSound });

        // Sort sounds by pad
        this.preset.sounds.sort((a, b) => a.pad - b.pad);

        // Reset form
        this.newSound = {
            pad: 0,
            name: '',
            url: ''
        };
    }

    removeSound(index: number): void {
        this.preset.sounds?.splice(index, 1);
    }

    onSubmit(): void {
        if (!this.preset.name) {
            this.error = 'Name is required';
            return;
        }

        this.isLoading = true;
        this.error = null;

        if (this.isEditMode && this.preset.id) {
            this.presetService.updatePreset(this.preset.id, this.preset).subscribe({
                next: () => {
                    this.router.navigate(['/']);
                },
                error: (err) => {
                    this.error = 'Failed to update preset';
                    this.isLoading = false;
                    console.error(err);
                }
            });
        } else {
            this.presetService.createPreset(this.preset).subscribe({
                next: () => {
                    this.router.navigate(['/']);
                },
                error: (err) => {
                    this.error = 'Failed to create preset';
                    this.isLoading = false;
                    console.error(err);
                }
            });
        }
    }
}
