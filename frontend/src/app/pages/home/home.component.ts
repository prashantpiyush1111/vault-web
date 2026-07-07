import { Component, OnInit } from '@angular/core';
import { UserService } from '../../services/user.service';
import { UserDto } from '../../models/dtos/UserDto';
import { CommonModule } from '@angular/common';
import { PrivateChatDialogComponent } from '../private-chat-dialog/private-chat-dialog.component';
import { PrivateChatService } from '../../services/private-chat.service';
import { PrivateChatDto } from '../../models/dtos/PrivateChatDto';
import { AuthService } from '../../services/auth.service';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { UiToastService } from '../../core/services/ui-toast.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    PrivateChatDialogComponent,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  users: UserDto[] = [];
  privateChats: PrivateChatDto[] = [];
  isLoading = true;
  error: string | null = null;
  selectedUsername: string | null = null;
  privateChatId: number | null = null;

  currentUsername: string | null = null;
  isEditMode = false;
  selectedChatIds: Set<number> = new Set();
  showClearConfirmDialog = false;
  isProcessing = false;
  showGroupDialog: boolean = false;
  newGroupName = '';
  groupDescription = '';
  private requestedPrivateChatId: number | null = null;
  searchText: string = '';
  filteredUsers: UserDto[] = [];
  filteredPrivateChats: PrivateChatDto[] = [];
  isAllUsersExpanded = false;
  private readonly USER_EXPANSION_SESSION_KEY = 'homeAllUsersSessionKey';

  private isHttpStatusZero(err: unknown): boolean {
    const candidate = err as { status?: number };
    return candidate?.status === 0;
  }

  constructor(
    private userService: UserService,
    private privateChatService: PrivateChatService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private toast: UiToastService,
  ) {}

  ngOnInit(): void {
    this.currentUsername = this.authService.getUsername();
    this.route.queryParamMap.subscribe((params) => {
      const rawChatId = params.get('privateChatId');
      const parsedChatId = rawChatId ? Number(rawChatId) : NaN;
      this.requestedPrivateChatId =
        Number.isInteger(parsedChatId) && parsedChatId > 0
          ? parsedChatId
          : null;
      this.tryOpenRequestedPrivateChat();
    });

    if (!this.currentUsername) {
      this.router.navigate(['/login']);
      this.error = 'User not logged in.';
      this.isLoading = false;
      return;
    }
    this.loadData();
    const saved = sessionStorage.getItem(this.USER_EXPANSION_SESSION_KEY);
    this.isAllUsersExpanded = saved === 'true'; //default false
  }

  private loadData() {
    this.isLoading = true;
    this.error = null;
    forkJoin({
      users: this.userService.getAllUsers(),
      chats: this.privateChatService.getUserPrivateChats(),
    }).subscribe({
      next: ({ users, chats }) => {
        this.users = users || [];
        this.privateChats = chats || [];
        this.filteredUsers = this.filterUsers(this.searchText, this.users);
        this.filteredPrivateChats = this.filterPrivateChats(
          this.searchText,
          this.privateChats,
        );
        this.isLoading = false;
        this.tryOpenRequestedPrivateChat();
      },
      error: (err: unknown) => {
        this.error = 'Failed to Load data.';
        if (!this.isHttpStatusZero(err)) {
          this.toast.error('Load failed', 'Could not load chats and users.');
        }
        this.isLoading = false;
      },
    });
  }

  openChat(username: string): void {
    if (!this.currentUsername) return;

    this.selectedUsername = username;

    this.privateChatService
      .getOrCreatePrivateChat(this.currentUsername, username)
      .subscribe({
        next: (chat: PrivateChatDto) => {
          this.privateChatId = chat.id;
        },
        error: () => {
          console.error('Failed to get or create private chat');
          this.toast.error(
            'Chat unavailable',
            'Could not open this chat right now.',
          );
        },
      });
  }

  closeChat(): void {
    this.selectedUsername = null;
    this.privateChatId = null;
  }

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    if (!this.isEditMode) {
      this.selectedChatIds.clear();
    }
  }

  toggleChatSelection(chatId: number) {
    if (this.selectedChatIds.has(chatId)) {
      this.selectedChatIds.delete(chatId);
    } else {
      this.selectedChatIds.add(chatId);
    }
  }

  isChatSelected(chatId: number): boolean {
    return this.selectedChatIds.has(chatId);
  }

  get hasSelectedChats(): boolean {
    return this.selectedChatIds.size > 0;
  }

  openPrivateChat(chat: PrivateChatDto) {
    if (this.isEditMode) return; //Don't open chat in edit mode
    if (!this.currentUsername) return;

    const otherUserName =
      chat.username1 === this.currentUsername ? chat.username2 : chat.username1;
    this.selectedUsername = otherUserName;
    this.privateChatId = chat.id;
  }

  private tryOpenRequestedPrivateChat(): void {
    if (!this.requestedPrivateChatId || this.isLoading) {
      return;
    }

    const chatToOpen = this.privateChats.find(
      (chat) => chat.id === this.requestedPrivateChatId,
    );
    if (!chatToOpen) {
      return;
    }

    this.openPrivateChat(chatToOpen);
    this.requestedPrivateChatId = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { privateChatId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  getOtherUsername(chat: PrivateChatDto): string {
    if (!this.currentUsername) return '';

    return chat.username1 === this.currentUsername
      ? chat.username2
      : chat.username1;
  }

  openClearConfirmDialog() {
    if (this.hasSelectedChats) {
      this.showClearConfirmDialog = true;
    }
  }

  cancelDialog() {
    if (this.isProcessing) {
      return;
    }
    this.showClearConfirmDialog = false;
    this.showGroupDialog = false;
    this.newGroupName = '';
    this.groupDescription = '';
  }

  confirmClearChats() {
    this.isProcessing = true;
    const chatIds = Array.from(this.selectedChatIds);
    this.privateChatService.clearMultiplePrivateChats(chatIds).subscribe({
      next: (_response) => {
        this.showClearConfirmDialog = false;
        this.selectedChatIds.clear();
        this.isProcessing = false;
        this.isEditMode = false;
        this.toast.success('Chats cleared', 'Selected chats were removed.');
        //Reload data to reflect changes
        this.loadData();
      },
      error: (err) => {
        console.error('Failed to clear chats ', err);
        this.error = 'Failed to clear chats. Please try again.';
        this.isProcessing = false;
        this.toast.error('Clear failed', 'Could not clear selected chats.');
      },
    });
  }

  openCreateGroupDialog() {
    if (this.hasSelectedChats) {
      this.showGroupDialog = true;
      this.newGroupName = '';
    }
  }

  confirmCreateGroup() {
    if (!this.newGroupName.trim()) {
      return;
    }
    const groupName = this.newGroupName.trim();
    this.isProcessing = true;
    const chatIds = Array.from(this.selectedChatIds);
    this.privateChatService
      .createGroupFromChats(chatIds, this.newGroupName, this.groupDescription)
      .subscribe({
        next: () => {
          this.showGroupDialog = false;
          this.isProcessing = false;
          this.isEditMode = false;
          this.newGroupName = '';
          this.groupDescription = '';
          this.selectedChatIds.clear();
          this.toast.success(
            'Group created',
            `"${groupName}" created successfully.`,
          );
          this.loadData();
        },
        error: (_err) => {
          this.error = 'Failed to create group. Please Try again.';
          this.isProcessing = false;
          this.toast.error(
            'Create group failed',
            'Please try again in a moment.',
          );
        },
      });
  }

  onSearchChange() {
    this.filteredUsers = this.filterUsers(this.searchText, this.users);
    this.filteredPrivateChats = this.filterPrivateChats(
      this.searchText,
      this.privateChats,
    );
  }

  private filterUsers(searchText: string, users: UserDto[]) {
    if (!searchText.trim()) return [...users];
    const term = searchText.trim();
    return users.filter((user) => this.matchUserName(user.username, term));
  }

  private filterPrivateChats(
    searchText: string,
    privateChats: PrivateChatDto[],
  ) {
    if (!searchText.trim()) return [...privateChats];
    const term = searchText.trim();
    return privateChats.filter((chat) =>
      this.matchUserName(this.getOtherUsername(chat), term),
    );
  }

  private matchUserName(userName: string, term: string): boolean {
    return userName.toLowerCase().includes(term.toLowerCase());
  }

  toggleUserExpansion() {
    this.isAllUsersExpanded = !this.isAllUsersExpanded;
    sessionStorage.setItem(
      this.USER_EXPANSION_SESSION_KEY,
      String(this.isAllUsersExpanded),
    );
  }

  displayUsername(username: string): string {
    return username === this.currentUsername ? `${username} (You)` : username;
  }

  getOtherUser(chat: PrivateChatDto): UserDto | undefined {
    const otherUserName = this.getOtherUsername(chat);
    return this.getUserByUsername(otherUserName);
  }

  getUserByUsername(username: string): UserDto | undefined {
    return this.users.find((u) => u.username === username);
  }

  getCurrentUser(): UserDto | undefined {
    if (!this.currentUsername) return undefined;
    return this.getUserByUsername(this.currentUsername);
  }

  getProfilePictureUrl(user: UserDto | undefined): string | null {
    if (!user || !user.profilePicture) return null;
    return this.userService.getProfilePictureUrl(user.profilePicture);
  }
}
