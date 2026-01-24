import { Component, OnInit, OnDestroy } from '@angular/core';
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
export class PresetCreate implements OnInit, OnDestroy {
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

    // Sound source mode: 'url', 'upload', 'record'
    addSoundMode: 'url' | 'upload' | 'record' = 'url';

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
    private audioContext: AudioContext | null = null;

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

    // =============================================
    // FILE UPLOAD METHODS
    // =============================================

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            this.selectedFile = input.files[0];
            // Auto-fill name if empty
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
        if (!this.selectedFile || !this.newSound.name) {
            alert('Please select a file and provide a name');
            return;
        }

        this.isUploading = true;

        try {
            const formData = new FormData();
            formData.append('file', this.selectedFile);

            const response = await fetch('/api/upload-audio', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const result = await response.json();
            
            // Add sound with the uploaded URL
            this.addSoundToPreset(this.newSound.pad, this.newSound.name, result.url);
            
            // Reset
            this.selectedFile = null;
            this.newSound = { pad: 0, name: '', url: '' };
        } catch (err) {
            console.error('Upload error:', err);
            alert('Failed to upload audio file');
        } finally {
            this.isUploading = false;
        }
    }

    // =============================================
    // RECORDING METHODS
    // =============================================

    async toggleRecording(): Promise<void> {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording(): Promise<void> {
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
                // Stop tracks
                stream.getTracks().forEach(track => track.stop());
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.recordingTime = 0;
            
            // Update recording time
            this.recordingInterval = setInterval(() => {
                this.recordingTime++;
            }, 1000);

        } catch (err) {
            console.error('Failed to start recording:', err);
            alert('Could not access microphone. Please grant permission.');
        }
    }

    stopRecording(): void {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            if (this.recordingInterval) {
                clearInterval(this.recordingInterval);
                this.recordingInterval = null;
            }
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
    }

    async uploadRecordingAndAdd(): Promise<void> {
        if (!this.recordedBlob || !this.newSound.name) {
            alert('Please record audio and provide a name');
            return;
        }

        this.isUploading = true;

        try {
            const formData = new FormData();
            const filename = `${this.newSound.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.webm`;
            formData.append('file', this.recordedBlob, filename);

            const response = await fetch('/api/upload-audio', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const result = await response.json();
            
            // Add sound with the uploaded URL
            this.addSoundToPreset(this.newSound.pad, this.newSound.name, result.url);
            
            // Reset
            this.clearRecording();
            this.newSound = { pad: 0, name: '', url: '' };
        } catch (err) {
            console.error('Upload error:', err);
            alert('Failed to upload recording');
        } finally {
            this.isUploading = false;
        }
    }

    // Helper to add sound to preset
    private addSoundToPreset(pad: number, name: string, url: string): void {
        if (pad < 0 || pad > 15) {
            alert('Pad number must be between 0 and 15.');
            return;
        }

        // Check if pad is already taken
        const existingIndex = this.preset.sounds?.findIndex(s => s.pad === pad);
        if (existingIndex !== undefined && existingIndex >= 0) {
            if (!confirm(`Pad ${pad} is already taken. Overwrite?`)) {
                return;
            }
            this.preset.sounds?.splice(existingIndex, 1);
        }

        if (!this.preset.sounds) {
            this.preset.sounds = [];
        }

        this.preset.sounds.push({ pad, name, url });
        this.preset.sounds.sort((a, b) => a.pad - b.pad);
    }

    ngOnDestroy(): void {
        if (this.recordingInterval) {
            clearInterval(this.recordingInterval);
        }
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}
