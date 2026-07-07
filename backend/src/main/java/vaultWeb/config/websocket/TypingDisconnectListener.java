package vaultWeb.config.websocket;

import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import vaultWeb.services.TypingIndicatorService;

@Component
@RequiredArgsConstructor
public class TypingDisconnectListener {
  private final TypingIndicatorService typingIndicatorService;

  @EventListener
  public void onSessionDisconnect(SessionDisconnectEvent event) {
    typingIndicatorService.handleDisconnect(event.getSessionId());
  }
}
