export interface UserDashboardDto {
  profile: ProfileSummary;
  groups: GroupSummary[];
  privateChats: PrivateChatSummary[];
  polls: PollSummary[];
  recentMessages: MessagePreview[];
}

export interface ProfileSummary {
  id: number;
  username: string;
  groupCount: number;
  privateChatCount: number;
  messagesSent: number;
  // Relative path to the user's profile picture — null if not set
  profilePicture?: string | null;
}

export interface GroupSummary {
  id: number;
  name: string;
  description: string;
  role: string;
  isPublic: boolean;
  memberCount: number;
  createdAt: string;
  pollCount: number;
}

export interface PrivateChatSummary {
  id: number;
  participant: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
}

export interface PollSummary {
  id: number;
  question: string;
  groupId: number;
  groupName: string;
  anonymous: boolean;
  deadline: string | null;
  optionCount: number;
  totalVotes: number;
}

export interface MessagePreview {
  id: number;
  content: string | null;
  timestamp: string;
  groupId: number | null;
  privateChatId: number | null;
}
