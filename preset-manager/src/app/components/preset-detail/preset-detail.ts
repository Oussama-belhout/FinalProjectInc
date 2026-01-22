import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PresetService } from '../../services/preset';
import { Preset } from '../../models/preset';

@Component({
  selector: 'app-preset-detail',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './preset-detail.html',
  styleUrl: './preset-detail.scss',
})
export class PresetDetail implements OnInit, OnDestroy {
  preset: Preset | null = null;
  loading = true;
  error: string | null = null;
  
  // Editing state
  isEditing = false;
  editName = '';
  editCategory = '';
  saving = false;
  
  // Audio playback
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  playingIndex: number | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private presetService: PresetService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    console.log('PresetDetail ngOnInit - loading preset:', id);
    if (id) {
      this.loadPreset(id);
    }
  }

  loadPreset(id: string): void {
    this.loading = true;
    this.error = null;
    console.log('loadPreset() called for:', id);
    
    this.presetService.getPreset(id).subscribe({
      next: (preset) => {
        console.log('Preset received:', preset);
        this.preset = preset;
        this.editName = preset.name;
        this.editCategory = preset.category;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading preset:', err);
        this.error = 'Failed to load preset.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  startEditing(): void {
    if (this.preset) {
      this.editName = this.preset.name;
      this.editCategory = this.preset.category;
      this.isEditing = true;
    }
  }

  cancelEditing(): void {
    this.isEditing = false;
    if (this.preset) {
      this.editName = this.preset.name;
      this.editCategory = this.preset.category;
    }
  }

  saveChanges(): void {
    if (!this.preset || !this.editName.trim()) return;
    
    this.saving = true;
    
    const updatedPreset = {
      ...this.preset,
      name: this.editName.trim(),
      category: this.editCategory.trim() || 'Custom'
    };
    
    this.presetService.updatePreset(this.preset.id, updatedPreset).subscribe({
      next: (preset) => {
        this.preset = preset;
        this.isEditing = false;
        this.saving = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        alert('Failed to save changes');
        this.saving = false;
        console.error('Error saving preset:', err);
        this.cdr.detectChanges();
      }
    });
  }

  deletePreset(): void {
    if (!this.preset) return;
    
    if (confirm(`Are you sure you want to delete "${this.preset.name}"?`)) {
      this.presetService.deletePreset(this.preset.id).subscribe({
        next: () => {
          this.router.navigate(['/presets']);
        },
        error: (err) => {
          alert('Failed to delete preset');
          console.error('Error deleting preset:', err);
          this.cdr.detectChanges();
        }
      });
    }
  }

  // Play a sound preview
  async playSound(url: string): Promise<void> {
    // Stop any currently playing sound
    this.stopSound();
    
    const index = this.preset?.sounds.findIndex(s => s.url === url) ?? -1;
    this.playingIndex = index;
    this.cdr.detectChanges();
    
    try {
      // Create audio context if needed
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }
      
      // Fetch and decode the audio
      const response = await fetch(`/api/proxy-audio?url=${encodeURIComponent(url)}`);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // Create and play source
      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = audioBuffer;
      this.currentSource.connect(this.audioContext.destination);
      
      this.currentSource.onended = () => {
        this.playingIndex = null;
        this.currentSource = null;
        this.cdr.detectChanges();
      };
      
      this.currentSource.start();
    } catch (err) {
      console.error('Error playing sound:', err);
      alert('Failed to play sound');
      this.playingIndex = null;
      this.cdr.detectChanges();
    }
  }

  stopSound(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      this.currentSource = null;
    }
    this.playingIndex = null;
  }

  // Delete a sound from the preset
  deleteSound(index: number): void {
    if (!this.preset) return;
    
    const sound = this.preset.sounds[index];
    const confirmMsg = sound.name 
      ? `Delete sound "${sound.name}" from Pad ${sound.pad}?`
      : `Delete sound from Pad ${sound.pad}?`;
    
    if (confirm(confirmMsg)) {
      // Remove sound from array
      const updatedSounds = [...this.preset.sounds];
      updatedSounds.splice(index, 1);
      
      const updatedPreset = {
        ...this.preset,
        sounds: updatedSounds
      };
      
      this.presetService.updatePreset(this.preset.id, updatedPreset).subscribe({
        next: (preset) => {
          this.preset = preset;
          this.cdr.detectChanges();
        },
        error: (err) => {
          alert('Failed to delete sound');
          console.error('Error deleting sound:', err);
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.stopSound();
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
