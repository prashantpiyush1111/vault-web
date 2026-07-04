package vaultWeb.controllers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.security.Principal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.access.AccessDeniedException;
import vaultWeb.dtos.ChatMessageDto;
import vaultWeb.exceptions.UnauthorizedException;
import vaultWeb.models.ChatMessage;
import vaultWeb.models.Group;
import vaultWeb.models.User;
import vaultWeb.repositories.GroupMemberRepository;
import vaultWeb.services.ChatService;

@ExtendWith(MockitoExtension.class)
class ChatControllerTest {

  private static final String SENDER_DEVICE_ID = "device-1";
  private static final String E2EE_PAYLOAD = "{\"v\":2}";

  @Mock private SimpMessagingTemplate messagingTemplate;

  @Mock private ChatService chatService;

  @Mock private GroupMemberRepository groupMemberRepository;

  @InjectMocks private ChatController chatController;

  @Test
  void shouldSendGroupMessage_WhenAuthenticatedUserIsGroupMember() {
    ChatMessageDto request = createGroupMessageRequest(10L);
    Principal principal = () -> "alice";
    ChatMessage savedMessage = createSavedGroupMessage(10L, "alice");

    when(groupMemberRepository.existsByGroupIdAndUserUsername(10L, "alice")).thenReturn(true);
    when(chatService.saveMessage(any(ChatMessageDto.class))).thenReturn(savedMessage);

    chatController.sendMessage(request, principal);

    ArgumentCaptor<ChatMessageDto> dtoCaptor = ArgumentCaptor.forClass(ChatMessageDto.class);
    verify(chatService).saveMessage(dtoCaptor.capture());
    assertEquals("alice", dtoCaptor.getValue().getSenderUsername());
    verify(messagingTemplate).convertAndSend(eq("/topic/group/10"), any(ChatMessageDto.class));
  }

  @Test
  void shouldRejectGroupMessage_WhenAuthenticatedUserIsNotGroupMember() {
    ChatMessageDto request = createGroupMessageRequest(10L);
    Principal principal = () -> "mallory";

    when(groupMemberRepository.existsByGroupIdAndUserUsername(10L, "mallory")).thenReturn(false);

    assertThrows(AccessDeniedException.class, () -> chatController.sendMessage(request, principal));
    verify(chatService, never()).saveMessage(any());
    verify(messagingTemplate, never()).convertAndSend(any(String.class), any(ChatMessageDto.class));
  }

  @Test
  void shouldRejectGroupMessage_WhenUnauthenticated() {
    ChatMessageDto request = createGroupMessageRequest(10L);

    assertThrows(UnauthorizedException.class, () -> chatController.sendMessage(request, null));
    verify(groupMemberRepository, never()).existsByGroupIdAndUserUsername(any(), any());
    verify(chatService, never()).saveMessage(any());
    verify(messagingTemplate, never()).convertAndSend(any(String.class), any(ChatMessageDto.class));
  }

  private ChatMessageDto createGroupMessageRequest(Long groupId) {
    ChatMessageDto dto = new ChatMessageDto();
    dto.setGroupId(groupId);
    dto.setSenderUsername("spoofed-sender");
    dto.setSenderDeviceId(SENDER_DEVICE_ID);
    dto.setE2eePayload(E2EE_PAYLOAD);
    return dto;
  }

  private ChatMessage createSavedGroupMessage(Long groupId, String username) {
    User sender = new User();
    sender.setUsername(username);
    Group group = new Group();
    group.setId(groupId);
    ChatMessage message = new ChatMessage();
    message.setGroup(group);
    message.setSender(sender);
    message.setSenderDeviceId(SENDER_DEVICE_ID);
    message.setE2eePayload(E2EE_PAYLOAD);
    message.setTimestamp(java.time.Instant.parse("2026-03-26T10:15:30Z"));
    return message;
  }
}
