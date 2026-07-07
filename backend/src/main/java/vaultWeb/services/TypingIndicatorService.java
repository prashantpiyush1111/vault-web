package vaultWeb.services;

import java.security.Principal;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import vaultWeb.dtos.TypingIndicatorDto;
import vaultWeb.exceptions.notfound.GroupNotFoundException;
import vaultWeb.exceptions.notfound.PrivateChatNotFoundException;
import vaultWeb.exceptions.notfound.UserNotFoundException;
import vaultWeb.models.Group;
import vaultWeb.models.GroupMember;
import vaultWeb.models.PrivateChat;
import vaultWeb.models.User;
import vaultWeb.repositories.GroupMemberRepository;
import vaultWeb.repositories.GroupRepository;
import vaultWeb.repositories.PrivateChatRepository;
import vaultWeb.repositories.UserRepository;

@Service
@RequiredArgsConstructor
public class TypingIndicatorService {
  public static final String TYPING_START = "typing_start";
  public static final String TYPING_STOP = "typing_stop";

  private static final Duration START_THROTTLE = Duration.ofSeconds(2);
  private static final Duration STALE_TIMEOUT = Duration.ofSeconds(8);

  private final SimpMessagingTemplate messagingTemplate;
  private final UserRepository userRepository;
  private final PrivateChatRepository privateChatRepository;
  private final GroupRepository groupRepository;
  private final GroupMemberRepository groupMemberRepository;

  private final Map<TypingKey, Instant> activeTyping = new ConcurrentHashMap<>();
  private final Map<TypingKey, Instant> lastStartByKey = new ConcurrentHashMap<>();
  private final Map<String, Set<TypingKey>> keysBySession = new ConcurrentHashMap<>();

  public void handleTypingEvent(TypingIndicatorDto event, Principal principal, String sessionId) {
    if (event == null) {
      throw new IllegalArgumentException("Typing event is required");
    }

    if (principal == null || principal.getName() == null) {
      throw new AccessDeniedException("WebSocket user is not authenticated");
    }

    if (TYPING_START.equals(event.getType())) {
      handleTypingStart(event, principal.getName(), sessionId);
      return;
    }

    if (TYPING_STOP.equals(event.getType())) {
      handleTypingStop(event, principal.getName(), sessionId);
      return;
    }

    throw new IllegalArgumentException("Unsupported typing event type");
  }

  public void handleDisconnect(String sessionId) {
    if (sessionId == null) {
      return;
    }

    Set<TypingKey> keys = keysBySession.remove(sessionId);
    if (keys == null) {
      return;
    }

    keys.forEach(
        key -> {
          if (activeTyping.remove(key) != null) {
            relayStop(key);
          }
        });
  }

  @Scheduled(fixedDelay = 1000)
  void clearStaleTypingEntries() {
    Instant now = Instant.now();
    activeTyping.forEach(
        (key, expiresAt) -> {
          if (!expiresAt.isAfter(now) && activeTyping.remove(key, expiresAt)) {
            removeKeyFromSessions(key);
            relayStop(key);
          }
        });
  }

  private void handleTypingStart(TypingIndicatorDto event, String username, String sessionId) {
    User sender = findUser(username);
    TypingTarget target = resolveTarget(event, sender);
    TypingKey key = TypingKey.from(target, sender);

    Instant now = Instant.now();
    Instant lastStart = lastStartByKey.get(key);
    if (lastStart != null && Duration.between(lastStart, now).compareTo(START_THROTTLE) < 0) {
      return;
    }

    lastStartByKey.put(key, now);
    activeTyping.put(key, now.plus(STALE_TIMEOUT));
    if (sessionId != null) {
      keysBySession.computeIfAbsent(sessionId, ignored -> ConcurrentHashMap.newKeySet()).add(key);
    }
    relay(key, TYPING_START);
  }

  private void handleTypingStop(TypingIndicatorDto event, String username, String sessionId) {
    User sender = findUser(username);
    TypingTarget target = resolveTarget(event, sender);
    TypingKey key = TypingKey.from(target, sender);

    activeTyping.remove(key);
    removeKeyFromSession(sessionId, key);
    relayStop(key);
  }

  private User findUser(String username) {
    return userRepository
        .findByUsername(username)
        .orElseThrow(() -> new UserNotFoundException("Typing sender not found"));
  }

  private TypingTarget resolveTarget(TypingIndicatorDto event, User sender) {
    boolean hasPrivateChat = event.getPrivateChatId() != null;
    boolean hasGroup = event.getGroupId() != null;

    if (hasPrivateChat == hasGroup) {
      throw new IllegalArgumentException("Typing event must target one private chat or one group");
    }

    if (hasPrivateChat) {
      PrivateChat chat =
          privateChatRepository
              .findById(event.getPrivateChatId())
              .orElseThrow(() -> new PrivateChatNotFoundException("Private chat not found"));
      if (!isPrivateChatParticipant(chat, sender)) {
        throw new AccessDeniedException("Not allowed to type in this private chat");
      }
      return TypingTarget.privateChat(chat);
    }

    Group group =
        groupRepository
            .findById(event.getGroupId())
            .orElseThrow(() -> new GroupNotFoundException("Group not found"));
    groupMemberRepository
        .findByGroupIdAndUserId(group.getId(), sender.getId())
        .orElseThrow(() -> new AccessDeniedException("Not allowed to type in this group"));
    return TypingTarget.group(group, groupMemberRepository.findAllByGroup(group));
  }

  private boolean isPrivateChatParticipant(PrivateChat chat, User sender) {
    return isSameUser(chat.getUser1(), sender) || isSameUser(chat.getUser2(), sender);
  }

  private boolean isSameUser(User left, User right) {
    return left != null && right != null && Objects.equals(left.getId(), right.getId());
  }

  private void relayStop(TypingKey key) {
    relay(key, TYPING_STOP);
  }

  private void relay(TypingKey key, String type) {
    TypingIndicatorDto outbound = new TypingIndicatorDto();
    outbound.setType(type);
    outbound.setPrivateChatId(key.privateChatId());
    outbound.setGroupId(key.groupId());
    outbound.setUserId(key.userId());
    outbound.setUsername(key.username());

    key.recipientUsernames().stream()
        .filter(recipient -> !recipient.equals(key.username()))
        .forEach(
            recipient ->
                messagingTemplate.convertAndSendToUser(recipient, "/queue/typing", outbound));
  }

  private void removeKeyFromSession(String sessionId, TypingKey key) {
    if (sessionId == null) {
      return;
    }

    Set<TypingKey> keys = keysBySession.get(sessionId);
    if (keys == null) {
      return;
    }
    keys.remove(key);
    if (keys.isEmpty()) {
      keysBySession.remove(sessionId);
    }
  }

  private void removeKeyFromSessions(TypingKey key) {
    keysBySession.forEach((sessionId, ignored) -> removeKeyFromSession(sessionId, key));
  }

  private record TypingTarget(Long privateChatId, Long groupId, Set<String> recipientUsernames) {
    static TypingTarget privateChat(PrivateChat chat) {
      Set<String> recipients = ConcurrentHashMap.newKeySet();
      if (chat.getUser1() != null && chat.getUser1().getUsername() != null) {
        recipients.add(chat.getUser1().getUsername());
      }
      if (chat.getUser2() != null && chat.getUser2().getUsername() != null) {
        recipients.add(chat.getUser2().getUsername());
      }
      return new TypingTarget(chat.getId(), null, recipients);
    }

    static TypingTarget group(Group group, Iterable<GroupMember> members) {
      Set<String> recipients = ConcurrentHashMap.newKeySet();
      for (GroupMember member : members) {
        if (member.getUser() != null && member.getUser().getUsername() != null) {
          recipients.add(member.getUser().getUsername());
        }
      }
      return new TypingTarget(null, group.getId(), recipients);
    }
  }

  private record TypingKey(
      Long privateChatId,
      Long groupId,
      Long userId,
      String username,
      Set<String> recipientUsernames) {
    static TypingKey from(TypingTarget target, User user) {
      return new TypingKey(
          target.privateChatId(),
          target.groupId(),
          user.getId(),
          user.getUsername(),
          target.recipientUsernames());
    }
  }
}
