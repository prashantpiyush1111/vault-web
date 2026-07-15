package vaultWeb.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import vaultWeb.dtos.dashboard.UserDashboardDto;
import vaultWeb.models.Group;
import vaultWeb.models.GroupMember;
import vaultWeb.models.User;
import vaultWeb.models.enums.Role;
import vaultWeb.repositories.ChatMessageRepository;
import vaultWeb.repositories.GroupMemberRepository;
import vaultWeb.repositories.GroupMemberRepository.GroupMemberCount;
import vaultWeb.repositories.PollRepository;
import vaultWeb.repositories.PrivateChatRepository;

@ExtendWith(MockitoExtension.class)
class DashboardServiceTest {

  @Mock private GroupMemberRepository groupMemberRepository;
  @Mock private PrivateChatRepository privateChatRepository;
  @Mock private PollRepository pollRepository;
  @Mock private ChatMessageRepository chatMessageRepository;

  @InjectMocks private DashboardService dashboardService;

  @Test
  void shouldLoadMemberCountsForAllGroupsWithOneQuery() {
    User user = new User();
    user.setId(1L);
    user.setUsername("alice");

    Group firstGroup = createGroup(10L, "First");
    Group secondGroup = createGroup(20L, "Second");
    List<GroupMember> memberships =
        List.of(
            new GroupMember(firstGroup, user, Role.ADMIN),
            new GroupMember(secondGroup, user, Role.USER));

    GroupMemberCount firstCount = memberCount(10L, 4L);
    GroupMemberCount secondCount = memberCount(20L, 7L);

    when(groupMemberRepository.findAllByUser(user)).thenReturn(memberships);
    when(groupMemberRepository.countMembersByGroupIds(
            argThat(groupIds -> Set.copyOf(groupIds).equals(Set.of(10L, 20L)))))
        .thenReturn(List.of(firstCount, secondCount));
    when(privateChatRepository.findByUser1OrUser2(user, user)).thenReturn(List.of());
    when(pollRepository.findByGroupIdIn(List.of(10L, 20L))).thenReturn(List.of());
    when(chatMessageRepository.findTop10BySenderOrderByTimestampDesc(user)).thenReturn(List.of());

    UserDashboardDto dashboard = dashboardService.buildDashboard(user);

    Map<Long, UserDashboardDto.GroupSummary> groupsById =
        dashboard.groups().stream()
            .collect(Collectors.toMap(UserDashboardDto.GroupSummary::id, Function.identity()));
    assertEquals(4, groupsById.get(10L).memberCount());
    assertEquals(7, groupsById.get(20L).memberCount());
    verify(groupMemberRepository)
        .countMembersByGroupIds(argThat(groupIds -> Set.copyOf(groupIds).equals(Set.of(10L, 20L))));
  }

  @Test
  void shouldUseZeroWhenAGroupHasNoReturnedMemberCount() {
    User user = new User();
    user.setId(1L);
    user.setUsername("alice");
    Group group = createGroup(10L, "First");

    when(groupMemberRepository.findAllByUser(user))
        .thenReturn(List.of(new GroupMember(group, user, Role.USER)));
    when(groupMemberRepository.countMembersByGroupIds(List.of(10L))).thenReturn(List.of());
    when(privateChatRepository.findByUser1OrUser2(user, user)).thenReturn(List.of());
    when(pollRepository.findByGroupIdIn(List.of(10L))).thenReturn(List.of());
    when(chatMessageRepository.findTop10BySenderOrderByTimestampDesc(user)).thenReturn(List.of());

    UserDashboardDto dashboard = dashboardService.buildDashboard(user);

    assertEquals(0, dashboard.groups().getFirst().memberCount());
  }

  private Group createGroup(Long id, String name) {
    Group group = new Group();
    group.setId(id);
    group.setName(name);
    group.setIsPublic(false);
    return group;
  }

  private GroupMemberCount memberCount(Long groupId, long count) {
    GroupMemberCount projection = mock(GroupMemberCount.class);
    when(projection.getGroupId()).thenReturn(groupId);
    when(projection.getMemberCount()).thenReturn(count);
    return projection;
  }
}
