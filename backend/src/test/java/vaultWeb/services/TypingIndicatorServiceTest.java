package vaultWeb.services;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.security.Principal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.access.AccessDeniedException;
import vaultWeb.dtos.TypingIndicatorDto;
import vaultWeb.models.Group;
import vaultWeb.models.GroupMember;
import vaultWeb.models.PrivateChat;
import vaultWeb.models.User;
import vaultWeb.repositories.GroupMemberRepository;
import vaultWeb.repositories.GroupRepository;
import vaultWeb.repositories.PrivateChatRepository;
import vaultWeb.repositories.UserRepository;

@ExtendWith(MockitoExtension.class)
class TypingIndicatorServiceTest {
  @Mock private SimpMessagingTemplate messagingTemplate;

  @Mock private UserRepository userRepository;

  @Mock private PrivateChatRepository privateChatRepository;

  @Mock private GroupRepository groupRepository;

  @Mock private GroupMemberRepository groupMemberRepository;

  @InjectMocks private TypingIndicatorService typingIndicatorService;

  private final Principal alicePrincipal = () -> "alice";

  @Test
  void shouldRelayPrivateTypingStartOnlyToOtherParticipant() {
    User alice = user(1L, "alice");
    User bob = user(2L, "bob");
    PrivateChat chat = privateChat(10L, alice, bob);

    when(userRepository.findByUsername("alice")).thenReturn(Optional.of(alice));
    when(privateChatRepository.findById(10L)).thenReturn(Optional.of(chat));

    typingIndicatorService.handleTypingEvent(
        privateTyping(TypingIndicatorService.TYPING_START), alicePrincipal, "s1");

    ArgumentCaptor<TypingIndicatorDto> captor = ArgumentCaptor.forClass(TypingIndicatorDto.class);
    verify(messagingTemplate)
        .convertAndSendToUser(eq("bob"), eq("/queue/typing"), captor.capture());
    verify(messagingTemplate, never())
        .convertAndSendToUser(eq("alice"), eq("/queue/typing"), any(TypingIndicatorDto.class));

    TypingIndicatorDto sent = captor.getValue();
    org.junit.jupiter.api.Assertions.assertEquals(
        TypingIndicatorService.TYPING_START, sent.getType());
    org.junit.jupiter.api.Assertions.assertEquals(10L, sent.getPrivateChatId());
    org.junit.jupiter.api.Assertions.assertEquals(1L, sent.getUserId());
    org.junit.jupiter.api.Assertions.assertEquals("alice", sent.getUsername());
  }

  @Test
  void shouldDropRapidDuplicateTypingStarts() {
    User alice = user(1L, "alice");
    User bob = user(2L, "bob");
    PrivateChat chat = privateChat(10L, alice, bob);

    when(userRepository.findByUsername("alice")).thenReturn(Optional.of(alice));
    when(privateChatRepository.findById(10L)).thenReturn(Optional.of(chat));

    typingIndicatorService.handleTypingEvent(
        privateTyping(TypingIndicatorService.TYPING_START), alicePrincipal, "s1");
    typingIndicatorService.handleTypingEvent(
        privateTyping(TypingIndicatorService.TYPING_START), alicePrincipal, "s1");

    verify(messagingTemplate, times(1))
        .convertAndSendToUser(eq("bob"), eq("/queue/typing"), any(TypingIndicatorDto.class));
  }

  @Test
  void shouldRelayTypingStopOnDisconnect() {
    User alice = user(1L, "alice");
    User bob = user(2L, "bob");
    PrivateChat chat = privateChat(10L, alice, bob);

    when(userRepository.findByUsername("alice")).thenReturn(Optional.of(alice));
    when(privateChatRepository.findById(10L)).thenReturn(Optional.of(chat));

    typingIndicatorService.handleTypingEvent(
        privateTyping(TypingIndicatorService.TYPING_START), alicePrincipal, "s1");
    typingIndicatorService.handleDisconnect("s1");

    ArgumentCaptor<TypingIndicatorDto> captor = ArgumentCaptor.forClass(TypingIndicatorDto.class);
    verify(messagingTemplate, times(2))
        .convertAndSendToUser(eq("bob"), eq("/queue/typing"), captor.capture());

    org.junit.jupiter.api.Assertions.assertEquals(
        TypingIndicatorService.TYPING_START, captor.getAllValues().get(0).getType());
    org.junit.jupiter.api.Assertions.assertEquals(
        TypingIndicatorService.TYPING_STOP, captor.getAllValues().get(1).getType());
  }

  @Test
  void shouldRejectPrivateTypingWhenSenderIsNotParticipant() {
    User alice = user(1L, "alice");
    User bob = user(2L, "bob");
    User carol = user(3L, "carol");
    PrivateChat chat = privateChat(10L, bob, carol);

    when(userRepository.findByUsername("alice")).thenReturn(Optional.of(alice));
    when(privateChatRepository.findById(10L)).thenReturn(Optional.of(chat));

    assertThrows(
        AccessDeniedException.class,
        () ->
            typingIndicatorService.handleTypingEvent(
                privateTyping(TypingIndicatorService.TYPING_START), alicePrincipal, "s1"));
  }

  @Test
  void shouldRejectMissingTypingEventPayload() {
    assertThrows(
        IllegalArgumentException.class,
        () -> typingIndicatorService.handleTypingEvent(null, alicePrincipal, "s1"));
  }

  @Test
  void shouldRejectUnsupportedTypingEventType() {
    TypingIndicatorDto event = privateTyping("typing_pause");

    assertThrows(
        IllegalArgumentException.class,
        () -> typingIndicatorService.handleTypingEvent(event, alicePrincipal, "s1"));
  }

  @Test
  void shouldRelayGroupTypingToOtherMembers() {
    User alice = user(1L, "alice");
    User bob = user(2L, "bob");
    User carol = user(3L, "carol");
    Group group = new Group();
    group.setId(20L);

    when(userRepository.findByUsername("alice")).thenReturn(Optional.of(alice));
    when(groupRepository.findById(20L)).thenReturn(Optional.of(group));
    when(groupMemberRepository.findByGroupIdAndUserId(20L, 1L))
        .thenReturn(Optional.of(new GroupMember(group, alice, null)));
    when(groupMemberRepository.findAllByGroup(group))
        .thenReturn(
            List.of(
                new GroupMember(group, alice, null),
                new GroupMember(group, bob, null),
                new GroupMember(group, carol, null)));

    TypingIndicatorDto event = new TypingIndicatorDto();
    event.setType(TypingIndicatorService.TYPING_START);
    event.setGroupId(20L);

    typingIndicatorService.handleTypingEvent(event, alicePrincipal, "s1");

    verify(messagingTemplate)
        .convertAndSendToUser(eq("bob"), eq("/queue/typing"), any(TypingIndicatorDto.class));
    verify(messagingTemplate)
        .convertAndSendToUser(eq("carol"), eq("/queue/typing"), any(TypingIndicatorDto.class));
    verify(messagingTemplate, never())
        .convertAndSendToUser(eq("alice"), eq("/queue/typing"), any(TypingIndicatorDto.class));
  }

  private TypingIndicatorDto privateTyping(String type) {
    TypingIndicatorDto event = new TypingIndicatorDto();
    event.setType(type);
    event.setPrivateChatId(10L);
    return event;
  }

  private User user(Long id, String username) {
    User user = new User();
    user.setId(id);
    user.setUsername(username);
    return user;
  }

  private PrivateChat privateChat(Long id, User user1, User user2) {
    PrivateChat chat = new PrivateChat();
    chat.setId(id);
    chat.setUser1(user1);
    chat.setUser2(user2);
    return chat;
  }
}
