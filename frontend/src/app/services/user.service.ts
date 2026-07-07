import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { UserDto } from '../models/dtos/UserDto';

export interface SecurityEventDto {
  id: number;
  eventType: string;
  status: string;
  timestamp: string;
  ipAddress: string;
  deviceId?: string;
  userAgent: string;
  location: string;
}

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private apiUrl = environment.mainApiUrl;

  private profilePicUrlSubject = new BehaviorSubject<string | null>(null);
  public profilePicUrl$ = this.profilePicUrlSubject.asObservable();

  constructor(private http: HttpClient) {}

  getAllUsers(): Observable<UserDto[]> {
    return this.http.get<UserDto[]>(`${this.apiUrl}/auth/users`);
  }

  getSecurityActivity(): Observable<SecurityEventDto[]> {
    return this.http.get<SecurityEventDto[]>(
      `${this.apiUrl}/auth/security-activity`,
    );
  }

  logSecurityEvent(eventType: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/auth/security-activity/log`, {
      eventType,
    });
  }

  // ── Profile Picture API Methods ─────────────────────────────────────────────

  /**
   * Uploads a new profile picture for the currently logged-in user.
   */
  uploadProfilePicture(file: File): Observable<{ profilePicture: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http
      .post<{
        profilePicture: string;
      }>(`${this.apiUrl}/auth/profile-picture`, formData)
      .pipe(
        tap((res) => {
          this.profilePicUrlSubject.next(
            this.getProfilePictureUrl(res.profilePicture),
          );
        }),
      );
  }

  /**
   * Fetches the current user's profile picture path from the backend.
   */
  getProfilePicture(): Observable<{ profilePicture: string }> {
    return this.http
      .get<{ profilePicture: string }>(`${this.apiUrl}/auth/profile-picture`)
      .pipe(
        tap((res) => {
          this.profilePicUrlSubject.next(
            this.getProfilePictureUrl(res.profilePicture),
          );
        }),
      );
  }

  /**
   * Deletes the current user's profile picture.
   */
  deleteProfilePicture(): Observable<void> {
    return this.http
      .delete<void>(`${this.apiUrl}/auth/profile-picture`)
      .pipe(tap(() => this.profilePicUrlSubject.next(null)));
  }

  /**
   * Converts a relative picture path into a full URL.
   */
  getProfilePictureUrl(relativePath: string | null | undefined): string | null {
    if (!relativePath) {
      return null;
    }
    const baseUrl = this.apiUrl.replace('/api', '');
    return `${baseUrl}/${relativePath}`;
  }
}
