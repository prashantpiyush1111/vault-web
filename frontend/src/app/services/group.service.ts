import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { GroupDto } from '../models/dtos/GroupDto';

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  private apiUrl = `${environment.mainApiUrl}/groups`;

  constructor(private http: HttpClient) {}

  getUserGroups(): Observable<GroupDto[]> {
    return this.http.get<GroupDto[]>(`${this.apiUrl}/my-groups`);
  }

  getGroupDetails(groupId: number): Observable<GroupDto> {
    return this.http.get<GroupDto>(`${this.apiUrl}/${groupId}`);
  }

  addMember(groupId: number, userId: number): Observable<GroupDto> {
    return this.http.post<GroupDto>(
      `${this.apiUrl}/${groupId}/members/${userId}`,
      {},
    );
  }

  removeMember(groupId: number, userId: number): Observable<GroupDto> {
    return this.http.delete<GroupDto>(
      `${this.apiUrl}/${groupId}/members/${userId}`,
    );
  }

  leaveGroup(groupId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${groupId}/leave`);
  }
}
