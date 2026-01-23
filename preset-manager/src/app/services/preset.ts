import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType, HttpRequest } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Preset, PresetSummary } from '../models/preset';

export interface UploadProgress {
  state: 'pending' | 'uploading' | 'done';
  progress: number;
  preset?: Preset;
}

@Injectable({
  providedIn: 'root',
})
export class PresetService {
  // Use relative URL - Angular proxy will forward to backend
  private apiUrl = '/api/presets';

  constructor(private http: HttpClient) {}

  /**
   * Get all presets (summary list)
   */
  getPresets(): Observable<PresetSummary[]> {
    return this.http.get<PresetSummary[]>(this.apiUrl);
  }

  /**
   * Get a single preset by ID
   */
  getPreset(id: string): Observable<Preset> {
    return this.http.get<Preset>(`${this.apiUrl}/${id}`);
  }

  /**
   * Create a new preset (JSON only, no files)
   */
  createPreset(preset: Partial<Preset>): Observable<Preset> {
    return this.http.post<Preset>(this.apiUrl, preset);
  }

  /**
   * Create a preset with file uploads
   * @param preset - Preset metadata
   * @param files - Array of files to upload
   * @param padAssignments - Map of filename to pad number
   */
  createPresetWithFiles(
    preset: Partial<Preset>,
    files: File[],
    padAssignments: Record<string, number>
  ): Observable<UploadProgress> {
    const formData = new FormData();
    formData.append('preset', JSON.stringify(preset));
    formData.append('padAssignments', JSON.stringify(padAssignments));
    
    files.forEach(file => {
      formData.append('files', file);
    });

    const req = new HttpRequest('POST', this.apiUrl, formData, {
      reportProgress: true
    });

    return this.http.request(req).pipe(
      map(event => this.getUploadProgress(event as HttpEvent<Preset>))
    );
  }

  /**
   * Update a preset (rename, update sounds, etc.)
   */
  updatePreset(id: string, preset: Partial<Preset>): Observable<Preset> {
    return this.http.put<Preset>(`${this.apiUrl}/${id}`, preset);
  }

  /**
   * Update a preset with file uploads
   */
  updatePresetWithFiles(
    id: string,
    preset: Partial<Preset>,
    files: File[],
    padAssignments: Record<string, number>
  ): Observable<UploadProgress> {
    const formData = new FormData();
    formData.append('preset', JSON.stringify(preset));
    formData.append('padAssignments', JSON.stringify(padAssignments));
    
    files.forEach(file => {
      formData.append('files', file);
    });

    const req = new HttpRequest('PUT', `${this.apiUrl}/${id}`, formData, {
      reportProgress: true
    });

    return this.http.request(req).pipe(
      map(event => this.getUploadProgress(event as HttpEvent<Preset>))
    );
  }

  /**
   * Delete a preset
   */
  deletePreset(id: string): Observable<{ message: string; id: string }> {
    return this.http.delete<{ message: string; id: string }>(`${this.apiUrl}/${id}`);
  }

  /**
   * Add a single sound to a preset (with optional file upload)
   */
  addSound(presetId: string, pad: number, file?: File, url?: string, name?: string): Observable<Preset> {
    const formData = new FormData();
    formData.append('pad', pad.toString());
    
    if (file) {
      formData.append('file', file);
    } else if (url) {
      formData.append('url', url);
      if (name) {
        formData.append('name', name);
      }
    }

    return this.http.post<Preset>(`${this.apiUrl}/${presetId}/sounds`, formData);
  }

  /**
   * Remove a sound from a preset
   */
  removeSound(presetId: string, pad: number): Observable<Preset> {
    return this.http.delete<Preset>(`${this.apiUrl}/${presetId}/sounds/${pad}`);
  }

  /**
   * Helper to track upload progress
   */
  private getUploadProgress(event: HttpEvent<Preset>): UploadProgress {
    switch (event.type) {
      case HttpEventType.Sent:
        return { state: 'pending', progress: 0 };
      case HttpEventType.UploadProgress:
        const progress = event.total
          ? Math.round((100 * event.loaded) / event.total)
          : 0;
        return { state: 'uploading', progress };
      case HttpEventType.Response:
        return { state: 'done', progress: 100, preset: event.body as Preset };
      default:
        return { state: 'pending', progress: 0 };
    }
  }
}
