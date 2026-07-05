import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewChild,
  QueryList,
  ViewChildren,
  AfterViewChecked,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatMessageDto } from '../../models/dtos/ChatMessageDto';
import { TypingIndicatorDto } from '../../models/dtos/TypingIndicatorDto';
import { WebSocketService } from '../../services/web-socket.service';
import { PrivateChatService } from '../../services/private-chat.service';
import { Subscription } from 'rxjs/internal/Subscription';
import { E2eeService } from '../../services/e2ee.service';
import { DeviceDto } from '../../models/dtos/DeviceDto';
import { UiToastService } from '../../core/services/ui-toast.service';

interface ChatMessageView {
  content: string;
  senderUsername?: string;
  privateChatId?: number;
  timestamp: string;
}

interface EncryptedMessageBodyV1 {
  v: 1;
  text: string;
  clientTimestamp?: string;
}

@Component({
  selector: 'app-private-chat-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './private-chat-dialog.component.html',
  styleUrls: ['./private-chat-dialog.component.scss'],
})
export class PrivateChatDialogComponent
  implements OnInit, OnDestroy, AfterViewChecked
{
  @Input() username!: string;
  @Input() currentUsername!: string | null;
  @Input() privateChatId!: number;
  @Output() closeChat = new EventEmitter<void>();

  messages: ChatMessageView[] = [];
  newMessage = '';
  private devices: DeviceDto[] = [];
  private lastDevicesRefreshAt = 0;
  private readonly devicesCacheTtlMs = 15000;

  @ViewChild('messageContainer') messageContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChildren('messageBubble') messageBubbles!: QueryList<
    ElementRef<HTMLDivElement>
  >;
  private privateMessageSub!: Subscription;
  private typingIndicatorSub!: Subscription;

  private shouldScroll = false;
  isSearchOpen = false;
  searchQuery = '';
  matchedMessageIndexes: number[] = [];
  private matchedMessageIndexSet = new Set<number>();
  activeMatchPosition = -1;
  private isTyping = false;
  private typingIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private typingStaleSweepTimer: ReturnType<typeof setInterval> | null = null;
  private readonly typingIdleTimeoutMs = 5000;
  private readonly typingStaleTimeoutMs = 8000;
  private readonly typingUsers = new Map<string, number>();

  constructor(
    private wsService: WebSocketService,
    private chatService: PrivateChatService,
    private e2eeService: E2eeService,
    private toast: UiToastService,
  ) {}

  ngOnInit(): void {
    this.chatService.getMessages(this.privateChatId).subscribe({
      next: (msgs) => {
        this.decryptMessages(msgs);
        this.shouldScroll = true;
      },
      error: () => {
        console.error('Error loading messages for private chat');
        this.toast.error('Chat load failed', 'Could not load messages.');
      },
    });

    this.privateMessageSub = this.wsService
      .subscribeToPrivateMessages()
      .subscribe((msg) => {
        if (msg.privateChatId === this.privateChatId) {
          this.decryptAndAppendMessage(msg);
        }
      });

    this.typingIndicatorSub = this.wsService
      .subscribeToTypingIndicators()
      .subscribe((event) => this.handleTypingIndicator(event));
    this.typingStaleSweepTimer = setInterval(
      () => this.removeStaleTypingUsers(),
      2000,
    );

    void this.initializeE2ee();
  }

  ngOnDestroy(): void {
    this.stopTyping();
    this.privateMessageSub?.unsubscribe();
    this.typingIndicatorSub?.unsubscribe();
    this.clearTypingTimers();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  scrollToBottom(): void {
    try {
      this.messageContainer.nativeElement.scrollTop =
        this.messageContainer.nativeElement.scrollHeight;
    } catch (err) {
      console.error('Scroll to bottom failed:', err);
    }
  }

  sendMessage(): void {
    if (!this.newMessage.trim()) return;

    this.stopTyping();
    void this.sendEncryptedMessage(this.newMessage);
  }

  onClose(): void {
    this.stopTyping();
    this.closeChat.emit();
  }

  onComposerInput(value: string): void {
    if (!value.trim()) {
      this.stopTyping();
      return;
    }

    if (!this.isTyping) {
      this.isTyping = true;
      this.sendTypingEvent('typing_start');
    }

    this.resetTypingIdleTimer();
  }

  get typingIndicatorLabel(): string {
    const names = Array.from(this.typingUsers.keys());

    if (names.length === 0) {
      return '';
    }

    if (names.length === 1) {
      return `${names[0]} is typing...`;
    }

    if (names.length === 2) {
      return `${names[0]} and ${names[1]} are typing...`;
    }

    return 'Several people are typing...';
  }

  private async initializeE2ee(): Promise<void> {
    try {
      await this.e2eeService.ensureDeviceRegistered();
      await this.refreshDevices();
    } catch {
      console.error('Failed to initialize end-to-end encryption');
      this.toast.warn(
        'Encryption setup issue',
        'Some messages may not be available until retry.',
      );
    }
  }

  private decryptMessages(messages: ChatMessageDto[]): void {
    Promise.all(
      messages.map(async (msg, index) => {
        try {
          return await this.toViewMessage(msg);
        } catch (err) {
          console.error(
            'Failed to decrypt message in private chat',
            {
              privateChatId: this.privateChatId,
              messageIndex: index,
            },
            err,
          );
          return null;
        }
      }),
    )
      .then((viewMessages) => {
        const successfulMessages = viewMessages.filter(
          (msg): msg is ChatMessageView => msg !== null,
        );
        if (successfulMessages.length !== viewMessages.length) {
          console.warn('Some messages failed to decrypt for private chat', {
            privateChatId: this.privateChatId,
            totalMessages: viewMessages.length,
            decryptedMessages: successfulMessages.length,
          });
        }
        this.messages = successfulMessages;
        this.applySearch();
        this.shouldScroll = true;
      })
      .catch((err) => {
        console.error(
          'Failed to decrypt one or more messages for private chat',
          this.privateChatId,
          err,
        );
      });
  }

  private decryptAndAppendMessage(message: ChatMessageDto): void {
    if (this.isDuplicateMessage(message)) {
      return;
    }
    this.toViewMessage(message)
      .then((viewMessage) => {
        if (!viewMessage) {
          console.warn(
            'Failed to decrypt incoming message for private chat',
            this.privateChatId,
          );
          return;
        }
        this.messages.push(viewMessage);
        if (viewMessage.senderUsername !== this.currentUsername) {
          this.typingUsers.delete(viewMessage.senderUsername ?? '');
        }
        this.applySearch();
        this.shouldScroll = !this.searchQuery.trim();
      })
      .catch((err) => {
        console.error(
          'Error decrypting incoming message for private chat',
          this.privateChatId,
          err,
        );
      });
  }

  private async toViewMessage(
    message: ChatMessageDto,
  ): Promise<ChatMessageView | null> {
    let content = message.content ?? null;
    let timestamp = message.timestamp;
    if (message.e2eePayload) {
      const decrypted = await this.e2eeService.decryptPayload(
        message.e2eePayload,
      );
      const parsed = this.parseDecryptedMessageBody(decrypted);
      content = parsed.text;
      if (parsed.clientTimestamp) {
        timestamp = parsed.clientTimestamp;
      }
    }
    if (!content) {
      content = message.e2eePayload
        ? 'Unable to decrypt message'
        : 'Encrypted message';
    }
    return {
      content,
      senderUsername: message.senderUsername,
      privateChatId: message.privateChatId,
      timestamp,
    };
  }

  private async sendEncryptedMessage(plaintext: string): Promise<void> {
    try {
      await this.e2eeService.ensureDeviceRegistered();
      this.devices = await this.fetchDevices();

      if (!this.devices.length) {
        // One forced refresh before failing keeps the common path fast while handling
        // participant-device changes reliably.
        this.devices = await this.fetchDevices(true);
        if (!this.devices.length) {
          console.error('No devices available for encryption');
          this.toast.error(
            'Message not sent',
            'No recipient devices available for encryption.',
          );
          return;
        }
      }

      const clientTimestamp = new Date().toISOString();
      const encryptedBody: EncryptedMessageBodyV1 = {
        v: 1,
        text: plaintext,
        clientTimestamp,
      };
      const payload = await this.e2eeService.encryptForDevices(
        JSON.stringify(encryptedBody),
        this.devices,
      );

      const message: ChatMessageDto = {
        timestamp: clientTimestamp,
        senderUsername: this.currentUsername ? this.currentUsername : 'Unknown',
        privateChatId: this.privateChatId,
        senderDeviceId: payload.senderDeviceId,
        e2eePayload: JSON.stringify(payload),
      };

      const isConnected = await this.wsService.ensureConnected();
      if (!isConnected) {
        console.error('WebSocket not connected. Message not sent.');
        this.toast.error(
          'Message not sent',
          'Connection unavailable. Please try again.',
        );
        return;
      }

      const sent = this.wsService.sendPrivateMessage(message);
      if (!sent) {
        console.error('WebSocket not connected. Message not sent.');
        this.toast.error(
          'Message not sent',
          'Connection unavailable. Please try again.',
        );
        return;
      }
      this.decryptAndAppendMessage(message);
      this.newMessage = '';
    } catch (error) {
      console.error('Failed to send encrypted message', error);
      this.toast.error('Message failed', 'Could not send message.');
    }
  }

  private async refreshDevices(): Promise<void> {
    this.devices = await this.fetchDevices(true);
  }

  private fetchDevices(forceRefresh = false): Promise<DeviceDto[]> {
    const isCacheFresh =
      Date.now() - this.lastDevicesRefreshAt < this.devicesCacheTtlMs;
    if (!forceRefresh && this.devices.length && isCacheFresh) {
      return Promise.resolve(this.devices);
    }
    return new Promise<DeviceDto[]>((resolve) => {
      this.chatService.getDevices(this.privateChatId).subscribe({
        next: (devices) => {
          this.lastDevicesRefreshAt = Date.now();
          resolve(devices);
        },
        error: (error) => {
          console.error('Error loading devices for private chat', error);
          resolve([]);
        },
      });
    });
  }

  toggleSearch() {
    this.isSearchOpen = !this.isSearchOpen;
    if (this.isSearchOpen) {
      setTimeout(() => this.searchInput?.nativeElement.focus(), 0);
    } else {
      this.searchQuery = '';
      this.applySearch();
      this.shouldScroll = true;
    }
  }

  applySearch(): void {
    const query = this.searchQuery.trim().toLowerCase();

    if (!query) {
      this.matchedMessageIndexes = [];
      this.matchedMessageIndexSet.clear();
      this.activeMatchPosition = -1;
      return;
    }

    this.matchedMessageIndexes = this.messages
      .map((msg, index) => ({ index, content: msg.content.toLowerCase() }))
      .filter((entry) => entry.content.includes(query))
      .map((entry) => entry.index);
    this.matchedMessageIndexSet = new Set(this.matchedMessageIndexes);

    this.activeMatchPosition = this.matchedMessageIndexes.length ? 0 : -1;
    this.scrollToActiveSearchMatch();
  }

  goToNextMatch(): void {
    if (!this.matchedMessageIndexes.length) {
      return;
    }
    this.activeMatchPosition =
      (this.activeMatchPosition + 1) % this.matchedMessageIndexes.length;
    this.scrollToActiveSearchMatch();
  }

  goToPreviousMatch(): void {
    if (!this.matchedMessageIndexes.length) {
      return;
    }
    this.activeMatchPosition =
      (this.activeMatchPosition - 1 + this.matchedMessageIndexes.length) %
      this.matchedMessageIndexes.length;
    this.scrollToActiveSearchMatch();
  }

  get searchMatchLabel(): string {
    if (!this.searchQuery.trim() || !this.matchedMessageIndexes.length) {
      return `0 / ${this.matchedMessageIndexes.length}`;
    }
    return `${this.activeMatchPosition + 1} / ${this.matchedMessageIndexes.length}`;
  }

  isMessageMatch(index: number): boolean {
    return this.matchedMessageIndexSet.has(index);
  }

  isActiveSearchMatch(index: number): boolean {
    if (this.activeMatchPosition < 0) {
      return false;
    }
    return this.matchedMessageIndexes[this.activeMatchPosition] === index;
  }

  private scrollToActiveSearchMatch(): void {
    if (this.activeMatchPosition < 0 || !this.messageBubbles.length) {
      return;
    }

    const messageIndex = this.matchedMessageIndexes[this.activeMatchPosition];
    const bubble = this.messageBubbles.get(messageIndex)?.nativeElement;
    if (!bubble) {
      return;
    }

    bubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  private parseDecryptedMessageBody(decrypted: string | null): {
    text: string | null;
    clientTimestamp: string | null;
  } {
    if (!decrypted) {
      return { text: null, clientTimestamp: null };
    }

    try {
      const parsed = JSON.parse(decrypted) as Partial<EncryptedMessageBodyV1>;
      if (parsed.v === 1 && typeof parsed.text === 'string') {
        const timestamp =
          typeof parsed.clientTimestamp === 'string' &&
          !Number.isNaN(Date.parse(parsed.clientTimestamp))
            ? parsed.clientTimestamp
            : null;
        return { text: parsed.text, clientTimestamp: timestamp };
      }
    } catch {
      // Backward compatibility for older messages that encrypted raw plaintext only.
    }

    return { text: decrypted, clientTimestamp: null };
  }

  private isDuplicateMessage(message: ChatMessageDto): boolean {
    return this.messages.some(
      (existing) =>
        existing.privateChatId === message.privateChatId &&
        existing.senderUsername === message.senderUsername &&
        existing.timestamp === message.timestamp,
    );
  }

  private handleTypingIndicator(event: TypingIndicatorDto): void {
    if (
      event.privateChatId !== this.privateChatId ||
      !event.username ||
      event.username === this.currentUsername
    ) {
      return;
    }

    if (event.type === 'typing_start') {
      this.typingUsers.set(
        event.username,
        Date.now() + this.typingStaleTimeoutMs,
      );
      return;
    }

    if (event.type === 'typing_stop') {
      this.typingUsers.delete(event.username);
    }
  }

  private resetTypingIdleTimer(): void {
    if (this.typingIdleTimer) {
      clearTimeout(this.typingIdleTimer);
    }
    this.typingIdleTimer = setTimeout(
      () => this.stopTyping(),
      this.typingIdleTimeoutMs,
    );
  }

  private stopTyping(): void {
    if (this.typingIdleTimer) {
      clearTimeout(this.typingIdleTimer);
      this.typingIdleTimer = null;
    }

    if (!this.isTyping) {
      return;
    }

    this.isTyping = false;
    this.sendTypingEvent('typing_stop');
  }

  private sendTypingEvent(type: TypingIndicatorDto['type']): void {
    this.wsService.sendTypingIndicator({
      type,
      privateChatId: this.privateChatId,
      groupId: null,
    });
  }

  private removeStaleTypingUsers(): void {
    const now = Date.now();
    Array.from(this.typingUsers.entries()).forEach(([username, expiresAt]) => {
      if (expiresAt <= now) {
        this.typingUsers.delete(username);
      }
    });
  }

  private clearTypingTimers(): void {
    if (this.typingIdleTimer) {
      clearTimeout(this.typingIdleTimer);
      this.typingIdleTimer = null;
    }
    if (this.typingStaleSweepTimer) {
      clearInterval(this.typingStaleSweepTimer);
      this.typingStaleSweepTimer = null;
    }
  }
}
