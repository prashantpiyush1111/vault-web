import {
  ComponentFixture,
  TestBed,
  discardPeriodicTasks,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { UiToastService } from '../../core/services/ui-toast.service';
import { ChatMessageDto } from '../../models/dtos/ChatMessageDto';
import { TypingIndicatorDto } from '../../models/dtos/TypingIndicatorDto';
import { DeviceDto } from '../../models/dtos/DeviceDto';
import { E2eeService } from '../../services/e2ee.service';
import { GroupChatService } from '../../services/group-chat.service';
import { PrivateChatService } from '../../services/private-chat.service';
import { WebSocketService } from '../../services/web-socket.service';
import { PrivateChatDialogComponent } from './private-chat-dialog.component';

describe('PrivateChatDialogComponent typing indicators', () => {
  let fixture: ComponentFixture<PrivateChatDialogComponent>;
  let component: PrivateChatDialogComponent;
  let typingEvents: Subject<TypingIndicatorDto>;
  let wsService: jasmine.SpyObj<WebSocketService>;

  beforeEach(async () => {
    typingEvents = new Subject<TypingIndicatorDto>();
    wsService = jasmine.createSpyObj<WebSocketService>('WebSocketService', [
      'subscribeToPrivateMessages',
      'subscribeToTypingIndicators',
      'sendTypingIndicator',
      'ensureConnected',
      'sendPrivateMessage',
      'sendGroupMessage',
      'subscribeToGroupMessages',
    ]);
    wsService.subscribeToPrivateMessages.and.returnValue(of<ChatMessageDto>());
    wsService.subscribeToGroupMessages.and.returnValue(of<ChatMessageDto>());
    wsService.subscribeToTypingIndicators.and.returnValue(
      typingEvents.asObservable(),
    );
    wsService.sendTypingIndicator.and.returnValue(true);
    wsService.ensureConnected.and.resolveTo(true);
    wsService.sendPrivateMessage.and.returnValue(true);
    wsService.sendGroupMessage.and.returnValue(true);

    const chatService = jasmine.createSpyObj<PrivateChatService>(
      'PrivateChatService',
      ['getMessages', 'getDevices'],
    );
    chatService.getMessages.and.returnValue(of([]));
    chatService.getDevices.and.returnValue(of<DeviceDto[]>([]));

    const groupChatService = jasmine.createSpyObj<GroupChatService>(
      'GroupChatService',
      ['getMessages', 'getDevices'],
    );
    groupChatService.getMessages.and.returnValue(of([]));
    groupChatService.getDevices.and.returnValue(of<DeviceDto[]>([]));

    const e2eeService = jasmine.createSpyObj<E2eeService>('E2eeService', [
      'ensureDeviceRegistered',
      'encryptForDevices',
      'decryptPayload',
    ]);
    e2eeService.ensureDeviceRegistered.and.resolveTo();

    const toast = jasmine.createSpyObj<UiToastService>('UiToastService', [
      'error',
      'warn',
    ]);

    await TestBed.configureTestingModule({
      imports: [PrivateChatDialogComponent],
      providers: [
        { provide: WebSocketService, useValue: wsService },
        { provide: PrivateChatService, useValue: chatService },
        { provide: GroupChatService, useValue: groupChatService },
        { provide: E2eeService, useValue: e2eeService },
        { provide: UiToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PrivateChatDialogComponent);
    component = fixture.componentInstance;
    component.username = 'bob';
    component.currentUsername = 'alice';
    component.privateChatId = 10;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('emits one typing start while active and a stop after local idle timeout', fakeAsync(() => {
    component.onComposerInput('h');
    component.onComposerInput('he');
    component.onComposerInput('hel');

    expect(wsService.sendTypingIndicator).toHaveBeenCalledTimes(1);
    expect(wsService.sendTypingIndicator).toHaveBeenCalledWith({
      type: 'typing_start',
      privateChatId: 10,
      groupId: null,
    });

    tick(5000);

    expect(wsService.sendTypingIndicator).toHaveBeenCalledTimes(2);
    expect(wsService.sendTypingIndicator).toHaveBeenCalledWith({
      type: 'typing_stop',
      privateChatId: 10,
      groupId: null,
    });
    discardPeriodicTasks();
  }));

  it('shows and clears incoming typing indicators for the active private chat', fakeAsync(() => {
    typingEvents.next({
      type: 'typing_start',
      privateChatId: 10,
      username: 'bob',
    });

    expect(component.typingIndicatorLabel).toBe('bob is typing...');

    typingEvents.next({
      type: 'typing_stop',
      privateChatId: 10,
      username: 'bob',
    });

    expect(component.typingIndicatorLabel).toBe('');
    discardPeriodicTasks();
  }));
});
