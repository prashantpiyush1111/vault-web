package vaultWeb.services;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import vaultWeb.exceptions.PollDoesNotBelongToGroupException;
import vaultWeb.exceptions.UnauthorizedException;
import vaultWeb.models.Group;
import vaultWeb.models.Poll;
import vaultWeb.models.PollContext;
import vaultWeb.models.PrivateChat;
import vaultWeb.models.User;
import vaultWeb.repositories.ChatMessageRepository;
import vaultWeb.repositories.GroupMemberRepository;
import vaultWeb.repositories.GroupRepository;
import vaultWeb.repositories.PollRepository;
import vaultWeb.repositories.PollVoteRepository;
import vaultWeb.repositories.PrivateChatRepository;

@ExtendWith(MockitoExtension.class)
class PollServiceTest {

  @Mock private PollRepository pollRepository;
  @Mock private GroupRepository groupRepository;
  @Mock private GroupMemberRepository groupMemberRepository;
  @Mock private PollVoteRepository pollVoteRepository;
  @Mock private PrivateChatRepository privateChatRepository;
  @Mock private ChatMessageRepository chatMessageRepository;

  @InjectMocks private PollService pollService;

  private User createUser(Long id, String username) {
    User user = new User();
    user.setId(id);
    user.setUsername(username);
    return user;
  }

  private PrivateChat createPrivateChat(Long id, User user1, User user2) {
    PrivateChat privateChat = new PrivateChat();
    privateChat.setId(id);
    privateChat.setUser1(user1);
    privateChat.setUser2(user2);
    return privateChat;
  }

  private Group createGroup(Long id) {
    Group group = new Group();
    group.setId(id);
    return group;
  }

  @Test
  void shouldRejectPollContextWithoutOwner() {
    assertThrows(IllegalArgumentException.class, () -> new PollContext(null, null));
  }

  @Test
  void shouldRejectPollContextWithMultipleOwners() {
    assertThrows(
        IllegalArgumentException.class, () -> new PollContext(createGroup(1L), new PrivateChat()));
  }

  @Test
  void shouldRejectGroupVoteWhenPollDoesNotBelongToGroup() {
    Poll poll = Poll.builder().id(9L).group(createGroup(20L)).build();
    when(pollRepository.findById(9L)).thenReturn(Optional.of(poll));

    assertThrows(
        PollDoesNotBelongToGroupException.class,
        () -> pollService.voteInGroup(10L, 9L, 1L, createUser(1L, "alice")));

    verifyNoInteractions(groupMemberRepository, pollVoteRepository);
  }

  @Test
  void shouldRejectPrivateChatVoteWhenPollDoesNotBelongToPrivateChat() {
    User alice = createUser(1L, "alice");
    User bob = createUser(2L, "bob");
    Poll poll =
        Poll.builder().id(9L).privateChat(createPrivateChat(30L, alice, bob)).author(alice).build();
    when(pollRepository.findById(9L)).thenReturn(Optional.of(poll));

    assertThrows(
        PollDoesNotBelongToGroupException.class,
        () -> pollService.voteInPrivateChat(40L, 9L, 1L, alice));

    verifyNoInteractions(pollVoteRepository);
  }

  @Test
  void shouldRejectPrivateChatPollAccessWhenUserIsNotParticipant() {
    User alice = createUser(1L, "alice");
    User bob = createUser(2L, "bob");
    User mallory = createUser(3L, "mallory");
    PrivateChat privateChat = createPrivateChat(30L, alice, bob);

    when(privateChatRepository.findById(30L)).thenReturn(Optional.of(privateChat));

    assertThrows(
        UnauthorizedException.class, () -> pollService.getPollsByPrivateChat(30L, mallory));
  }

  @Test
  void shouldDeleteChatMessageBeforeDeletingPoll() {
    User alice = createUser(1L, "alice");
    User bob = createUser(2L, "bob");
    PrivateChat privateChat = createPrivateChat(30L, alice, bob);
    Poll poll = Poll.builder().id(9L).privateChat(privateChat).author(alice).build();

    when(pollRepository.findById(9L)).thenReturn(Optional.of(poll));

    pollService.deletePollInPrivateChat(30L, 9L, alice);

    InOrder inOrder = inOrder(chatMessageRepository, pollRepository);
    inOrder.verify(chatMessageRepository).deleteByPoll(poll);
    inOrder.verify(pollRepository).delete(poll);
  }
}
