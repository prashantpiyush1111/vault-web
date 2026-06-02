package vaultWeb.controllers;

import jakarta.validation.Valid;
import java.util.LinkedHashSet;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import vaultWeb.dtos.ChatMessageDto;
import vaultWeb.models.ChatMessage;
import vaultWeb.services.ChatService;

/**
 * Controller responsible for handling WebSocket-based chat functionality.
 *
 * <p>Supports both group chat and private messages. Messages are first persisted via ChatService
 * and then dispatched to the corresponding topics or users.
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class ChatController {

  private final SimpMessagingTemplate messagingTemplate;
  private final ChatService chatService;

  /**
   * Handles incoming group chat messages from clients and broadcasts them to all subscribers of the
   * specified group topic.
   *
   * @param messageDto DTO containing message content, sender information, and target group
   */
  @MessageMapping("/chat.send")
  public void sendMessage(@Valid @Payload ChatMessageDto messageDto) {
    ChatMessage savedMessage = chatService.saveMessage(messageDto);

    ChatMessageDto responseDto = chatService.toDto(savedMessage);

    messagingTemplate.convertAndSend(
        "/topic/group/" + savedMessage.getGroup().getId(), responseDto);
  }

  /**
   * Handles incoming private chat messages from clients and sends them to both users of the private
   * chat. The message content is end-to-end encrypted and never decrypted by the server.
   *
   * @param messageDto DTO containing message content, sender information, and private chat ID
   */
  @MessageMapping("/chat.private.send")
  public void sendPrivateMessage(@Valid @Payload ChatMessageDto messageDto) {
    ChatMessage savedMessage = chatService.saveMessage(messageDto);

    ChatMessageDto responseDto = chatService.toDto(savedMessage);

    String user1 = savedMessage.getPrivateChat().getUser1().getUsername();
    String user2 = savedMessage.getPrivateChat().getUser2().getUsername();

    Set<String> recipients = new LinkedHashSet<>();
    recipients.add(user1);
    recipients.add(user2);

    recipients.forEach(
        user -> messagingTemplate.convertAndSendToUser(user, "/queue/private", responseDto));

    log.debug(
        "Private message sent from {} to privateChat {}",
        responseDto.getSenderUsername(),
        responseDto.getPrivateChatId());
  }
}
