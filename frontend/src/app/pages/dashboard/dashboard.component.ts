import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { DashboardService } from '../../services/dashboard.service';
import { UserDashboardDto } from '../../models/dtos/UserDashboardDto';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import {
  GroupSummary,
  MessagePreview,
  PrivateChatSummary,
} from '../../models/dtos/UserDashboardDto';
import { PrivateChatDialogComponent } from '../private-chat-dialog/private-chat-dialog.component';
import { UiToastService } from '../../core/services/ui-toast.service';

interface StatHighlight {
  label: string;
  value: string;
  helper: string;
  accent: 'cyan' | 'amber' | 'emerald' | 'rose';
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, PrivateChatDialogComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  dashboard?: UserDashboardDto;
  isLoading = true;
  error: string | null = null;
  statHighlights: StatHighlight[] = [];
  readonly maxRecentMessages = 12;
  passwordForm: FormGroup;
  isSavingPassword = false;
  passwordSuccess = '';
  passwordError = '';
  selectedGroup: GroupSummary | null = null;
  private privateChatParticipants = new Map<number, string>();
  private groupsById = new Map<number, GroupSummary>();
  private readonly passwordComplexity =
    /(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+/;

  // ── Profile Picture State ────────────────────────────────────────────────
  profilePictureUrl: string | null = null;
  isUploadingPicture = false;
  pictureSuccess = '';
  pictureError = '';

  constructor(
    private dashboardService: DashboardService,
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private toast: UiToastService,
    private userService: UserService,
  ) {
    this.passwordForm = this.createPasswordForm();
  }

  ngOnInit(): void {
    this.loadDashboard();
    this.loadProfilePicture();
  }

  retry(): void {
    this.loadDashboard(true);
  }

  openPrivateChat(chat: PrivateChatSummary): void {
    this.router.navigate(['/'], {
      queryParams: { privateChatId: chat.id },
    });
  }

  openGroupChat(group: GroupSummary): void {
    this.selectedGroup = group;
  }

  closeGroupChat(): void {
    this.selectedGroup = null;
  }

  onGroupChatKeydown(event: KeyboardEvent, group: GroupSummary): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    this.openGroupChat(group);
  }

  onPrivateChatKeydown(event: KeyboardEvent, chat: PrivateChatSummary): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    this.openPrivateChat(chat);
  }

  openRecentMessage(message: MessagePreview): void {
    if (message.privateChatId) {
      this.router.navigate(['/'], {
        queryParams: { privateChatId: message.privateChatId },
      });
    } else if (message.groupId) {
      const group = this.groupsById.get(message.groupId);
      if (group) {
        this.openGroupChat(group);
      } else {
        this.toast.warn(
          'Group unavailable',
          'This group chat is no longer available from your dashboard.',
        );
      }
    }
  }

  onRecentMessageKeydown(event: KeyboardEvent, message: MessagePreview): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    this.openRecentMessage(message);
  }

  getPrivateChatPreview(chat: PrivateChatSummary): string {
    if (!chat.lastMessageAt) {
      return 'No messages yet';
    }
    return `Message sent in chat with ${chat.participant}`;
  }

  getRecentMessageText(message: MessagePreview): string {
    if (message.privateChatId) {
      const participant = this.privateChatParticipants.get(
        message.privateChatId,
      );
      return participant
        ? `Message sent in chat with ${participant}`
        : 'Message sent in private chat';
    }

    return this.truncate(message.content || 'Message sent');
  }

  getRecentMessageMeta(message: MessagePreview): string {
    if (message.privateChatId) {
      const participant = this.privateChatParticipants.get(
        message.privateChatId,
      );
      return participant ? `Chat with ${participant}` : 'Private chat';
    }

    if (message.groupId) {
      return `Group chat`;
    }

    return 'Activity';
  }

  canOpenRecentMessage(message: MessagePreview): boolean {
    return (
      !!message.privateChatId ||
      (!!message.groupId && this.groupsById.has(message.groupId))
    );
  }

  trackById(_: number, item: { id: number }): number {
    return item?.id ?? 0;
  }

  get recentMessagesLimited(): MessagePreview[] {
    return (
      this.dashboard?.recentMessages.slice(0, this.maxRecentMessages) ?? []
    );
  }

  get currentUsername(): string | null {
    return this.authService.getUsername();
  }

  get hasMoreRecentMessages(): boolean {
    return (
      (this.dashboard?.recentMessages.length ?? 0) > this.maxRecentMessages
    );
  }

  get hiddenRecentMessagesCount(): number {
    const total = this.dashboard?.recentMessages.length ?? 0;
    return Math.max(total - this.maxRecentMessages, 0);
  }

  get pf(): { [key: string]: AbstractControl } {
    return this.passwordForm.controls;
  }

  submitPasswordChange(): void {
    this.passwordSuccess = '';
    this.passwordError = '';

    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword } = this.passwordForm.value;
    if (!currentPassword || !newPassword) {
      return;
    }

    this.isSavingPassword = true;
    this.authService.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.isSavingPassword = false;
        this.passwordSuccess = 'Password updated successfully.';
        this.passwordForm.reset();
        this.passwordForm.markAsPristine();
        this.passwordForm.markAsUntouched();
      },
      error: (error) => {
        this.isSavingPassword = false;
        const serverMessage =
          typeof error?.error === 'string'
            ? error.error
            : error?.error?.message;
        this.passwordError =
          serverMessage || 'Update failed. Please try again.';
      },
    });
  }

  isDeadlineActive(deadline: string | null): boolean {
    if (!deadline) {
      return true;
    }
    return new Date(deadline).getTime() >= Date.now();
  }

  // ── Profile Picture Methods ───────────────────────────────────────────────

  /**
   * Loads the current user's profile picture from the backend.
   */
  private loadProfilePicture(): void {
    this.userService.getProfilePicture().subscribe({
      next: (res) => {
        this.profilePictureUrl = this.userService.getProfilePictureUrl(
          res.profilePicture,
        );
      },
      error: () => {
        this.profilePictureUrl = null;
      },
    });
  }

  /**
   * Called when the user selects a file to upload.
   */
  onProfilePictureSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    this.pictureSuccess = '';
    this.pictureError = '';
    this.isUploadingPicture = true;

    this.userService.uploadProfilePicture(file).subscribe({
      next: (res) => {
        this.profilePictureUrl = this.userService.getProfilePictureUrl(
          res.profilePicture,
        );
        this.isUploadingPicture = false;
        this.pictureSuccess = 'Profile picture updated successfully!';
        setTimeout(() => (this.pictureSuccess = ''), 4000);
      },
      error: (err) => {
        this.isUploadingPicture = false;
        this.pictureError =
          err?.error?.message || 'Upload failed. Please try again.';
      },
    });
  }

  /**
   * Called when the user clicks "Remove Photo".
   */
  removeProfilePicture(): void {
    this.pictureSuccess = '';
    this.pictureError = '';
    this.isUploadingPicture = true;

    this.userService.deleteProfilePicture().subscribe({
      next: () => {
        this.profilePictureUrl = null;
        this.isUploadingPicture = false;
        this.pictureSuccess = 'Profile picture removed.';
        setTimeout(() => (this.pictureSuccess = ''), 4000);
      },
      error: () => {
        this.isUploadingPicture = false;
        this.pictureError = 'Could not remove the picture. Please try again.';
      },
    });
  }

  private loadDashboard(isRetry = false): void {
    if (!isRetry) {
      this.isLoading = true;
      this.error = null;
    }

    this.dashboardService.getDashboard().subscribe({
      next: (data) => {
        this.dashboard = data;
        this.privateChatParticipants = new Map(
          data.privateChats.map((chat) => [chat.id, chat.participant]),
        );
        this.groupsById = new Map(
          data.groups.map((group) => [group.id, group]),
        );
        this.isLoading = false;
        this.error = null;
        this.buildHighlights(data);
      },
      error: () => {
        this.isLoading = false;
        this.error = 'Failed to load the dashboard.';
      },
    });
  }

  private buildHighlights(data: UserDashboardDto): void {
    const messages = Intl.NumberFormat('en-US').format(
      data.profile.messagesSent,
    );
    this.statHighlights = [
      {
        label: 'Groups',
        value: data.profile.groupCount.toString(),
        helper: 'active communities',
        accent: 'cyan',
      },
      {
        label: 'Private chats',
        value: data.profile.privateChatCount.toString(),
        helper: 'ongoing conversations',
        accent: 'amber',
      },
      {
        label: 'Messages sent',
        value: messages,
        helper: 'total',
        accent: 'emerald',
      },
      {
        label: 'Open polls',
        value: data.polls.length.toString(),
        helper: 'need attention',
        accent: 'rose',
      },
    ];
  }

  private createPasswordForm(): FormGroup {
    return this.fb.group(
      {
        currentPassword: ['', [Validators.required]],
        newPassword: [
          '',
          [
            Validators.required,
            Validators.minLength(8),
            Validators.pattern(this.passwordComplexity),
          ],
        ],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator.bind(this) },
    );
  }

  private passwordMatchValidator(
    control: AbstractControl,
  ): ValidationErrors | null {
    const newPassword = control.get('newPassword')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;

    if (!newPassword || !confirmPassword) {
      return null;
    }

    return newPassword === confirmPassword ? null : { mismatch: true };
  }

  private truncate(value: string, maxLength = 110): string {
    if (!value || value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength - 1)}...`;
  }
}
