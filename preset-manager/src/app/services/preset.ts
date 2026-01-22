import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Preset, PresetSummary } from '../models/preset';

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
   * Create a new preset
   */
  createPreset(preset: Partial<Preset>): Observable<Preset> {
    return this.http.post<Preset>(this.apiUrl, preset);
  }

  /**
   * Update a preset (rename, update sounds, etc.)
   */
  updatePreset(id: string, preset: Partial<Preset>): Observable<Preset> {
    return this.http.put<Preset>(`${this.apiUrl}/${id}`, preset);
  }

  /**
   * Delete a preset
   */
  deletePreset(id: string): Observable<{ message: string; id: string }> {
    return this.http.delete<{ message: string; id: string }>(`${this.apiUrl}/${id}`);
  }
}
