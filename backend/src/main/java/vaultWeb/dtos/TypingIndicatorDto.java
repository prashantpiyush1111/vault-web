package vaultWeb.dtos;

import lombok.Data;

@Data
public class TypingIndicatorDto {
  private String type;
  private Long privateChatId;
  private Long groupId;
  private Long userId;
  private String username;
}
