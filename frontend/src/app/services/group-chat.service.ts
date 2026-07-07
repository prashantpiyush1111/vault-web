import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ChatMessageDto } from '../models/dtos/ChatMessageDto';
import { DeviceDto } from '../models/dtos/DeviceDto';

@Injectable({
  providedIn: 'root',
})
export class GroupChatService {
  private apiUrl = environment.mainApiUrl;

  constructor(private http: HttpClient) {}

  getMessages(groupId: number): Observable<ChatMessageDto[]> {
    return this.http.get<ChatMessageDto[]>(
      `${this.apiUrl}/groups/${groupId}/messages`,
    );
  }

  getDevices(groupId: number): Observable<DeviceDto[]> {
    return this.http.get<DeviceDto[]>(
      `${this.apiUrl}/groups/${groupId}/devices`,
    );
  }
}
