package vaultWeb.controllers;

import java.security.Principal;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;
import vaultWeb.dtos.TypingIndicatorDto;
import vaultWeb.services.TypingIndicatorService;

@Controller
@RequiredArgsConstructor
public class TypingIndicatorController {
  private final TypingIndicatorService typingIndicatorService;

  @MessageMapping("/chat.typing")
  public void typing(
      @Payload TypingIndicatorDto event,
      Principal principal,
      @Header(name = "simpSessionId", required = false) String sessionId) {
    typingIndicatorService.handleTypingEvent(event, principal, sessionId);
  }
}
