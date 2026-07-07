export interface TypingIndicatorDto {
  type: 'typing_start' | 'typing_stop';
  privateChatId?: number | null;
  groupId?: number | null;
  userId?: number;
  username?: string;
}
