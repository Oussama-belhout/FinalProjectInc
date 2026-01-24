import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
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

  // Add sound state
  addSoundMode: 'url' | 'upload' | 'record' = 'url';
  newSound = { pad: 0, name: '', url: '' };
  
  // File upload
  selectedFile: File | null = null;
  isDragging = false;
  isUploading = false;
  
  // Recording
  isRecording = false;
  recordedBlob: Blob | null = null;
  recordingTime = 0;
  recordingDuration = 0;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingInterval: any = null;
  private routeSubscription: Subscription | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private presetService: PresetService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Subscribe to route params to handle navigation between presets
    this.routeSubscription = this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      console.log('PresetDetail route changed - loading preset:', id);
      if (id) {
        this.loadPreset(id);
      }
    });
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
      
      // Determine the fetch URL - use proxy for external URLs, direct for local files
      let fetchUrl: string;
      if (url.startsWith('/') || url.startsWith(window.location.origin)) {
        // Local file - fetch directly
        fetchUrl = url;
      } else {
        // External URL - use proxy to bypass CORS
        fetchUrl = `/api/proxy-audio?url=${encodeURIComponent(url)}`;
      }
      
      // Fetch and decode the audio
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
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
    if (this.routeSubscription) {
      this.routeSubscription.unsubscribe();
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
    }
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }
  }

  // =============================================
  // ADD SOUND FROM URL
  // =============================================

  addSoundFromUrl(): void {
    if (!this.preset || !this.newSound.name || !this.newSound.url) {
      alert('Please provide both name and URL');
      return;
    }
    this.addSoundToPreset(this.newSound.pad, this.newSound.name, this.newSound.url);
  }

  // =============================================
  // FILE UPLOAD METHODS
  // =============================================

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      if (!this.newSound.name) {
        this.newSound.name = this.selectedFile.name.replace(/\.[^/.]+$/, '');
      }
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      if (file.type.startsWith('audio/')) {
        this.selectedFile = file;
        if (!this.newSound.name) {
          this.newSound.name = file.name.replace(/\.[^/.]+$/, '');
        }
      } else {
        alert('Please drop an audio file');
      }
    }
  }

  async uploadAndAddSound(): Promise<void> {
    if (!this.preset || !this.selectedFile || !this.newSound.name) {
      alert('Please select a file and provide a name');
      return;
    }

    this.isUploading = true;
    this.cdr.detectChanges();

    try {
      const formData = new FormData();
      formData.append('file', this.selectedFile);

      const response = await fetch('/api/upload-audio', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Upload failed');

      const result = await response.json();
      this.addSoundToPreset(this.newSound.pad, this.newSound.name, result.url);
      this.selectedFile = null;
    } catch (err) {
      console.error('Upload error:', err);
      alert('Failed to upload audio file');
    } finally {
      this.isUploading = false;
      this.cdr.detectChanges();
    }
  }

  // =============================================
  // RECORDING METHODS
  // =============================================

  async toggleRecording(): Promise<void> {
    if (this.isRecording) {
      this.stopRecordingAudio();
    } else {
      await this.startRecordingAudio();
    }
  }

  async startRecordingAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.recordedBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.recordingDuration = this.recordingTime;
        stream.getTracks().forEach(track => track.stop());
        this.cdr.detectChanges();
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.recordingTime = 0;
      
      this.recordingInterval = setInterval(() => {
        this.recordingTime++;
        this.cdr.detectChanges();
      }, 1000);

      this.cdr.detectChanges();
    } catch (err) {
      console.error('Failed to start recording:', err);
      alert('Could not access microphone. Please grant permission.');
    }
  }

  stopRecordingAudio(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      
      if (this.recordingInterval) {
        clearInterval(this.recordingInterval);
        this.recordingInterval = null;
      }
      this.cdr.detectChanges();
    }
  }

  async playRecordedSound(): Promise<void> {
    if (!this.recordedBlob) return;

    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      const arrayBuffer = await this.recordedBlob.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start();
    } catch (err) {
      console.error('Failed to play recording:', err);
    }
  }

  clearRecording(): void {
    this.recordedBlob = null;
    this.recordingTime = 0;
    this.recordingDuration = 0;
    this.cdr.detectChanges();
  }

  async uploadRecordingAndAdd(): Promise<void> {
    if (!this.preset || !this.recordedBlob || !this.newSound.name) {
      alert('Please record audio and provide a name');
      return;
    }

    this.isUploading = true;
    this.cdr.detectChanges();

    try {
      const formData = new FormData();
      const filename = `${this.newSound.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.webm`;
      formData.append('file', this.recordedBlob, filename);

      const response = await fetch('/api/upload-audio', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Upload failed');

      const result = await response.json();
      this.addSoundToPreset(this.newSound.pad, this.newSound.name, result.url);
      this.clearRecording();
    } catch (err) {
      console.error('Upload error:', err);
      alert('Failed to upload recording');
    } finally {
      this.isUploading = false;
      this.cdr.detectChanges();
    }
  }

  // =============================================
  // HELPER - ADD SOUND TO PRESET
  // =============================================

  private addSoundToPreset(pad: number, name: string, url: string): void {
    if (!this.preset) return;

    if (pad < 0 || pad > 15) {
      alert('Pad number must be between 0 and 15.');
      return;
    }

    // Check if pad is already taken
    const existingIndex = this.preset.sounds.findIndex(s => s.pad === pad);
    if (existingIndex >= 0) {
      if (!confirm(`Pad ${pad} is already taken. Overwrite?`)) {
        return;
      }
      this.preset.sounds.splice(existingIndex, 1);
    }

    // Add new sound
    const updatedSounds = [...this.preset.sounds, { pad, name, url }];
    updatedSounds.sort((a, b) => a.pad - b.pad);

    const updatedPreset = { ...this.preset, sounds: updatedSounds };

    this.presetService.updatePreset(this.preset.id, updatedPreset).subscribe({
      next: (preset) => {
        this.preset = preset;
        this.newSound = { pad: 0, name: '', url: '' };
        this.cdr.detectChanges();
      },
      error: (err) => {
        alert('Failed to add sound');
        console.error('Error adding sound:', err);
      }
    });
  }
}
