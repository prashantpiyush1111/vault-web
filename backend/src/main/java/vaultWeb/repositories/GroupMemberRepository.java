package vaultWeb.repositories;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import vaultWeb.models.Group;
import vaultWeb.models.GroupMember;
import vaultWeb.models.User;
import vaultWeb.models.enums.Role;

@Repository
public interface GroupMemberRepository extends JpaRepository<GroupMember, Long> {
  Optional<GroupMember> findByGroupAndUser(Group group, User user);

  Optional<GroupMember> findByGroupIdAndUserId(Long groupId, Long userId);

  boolean existsByGroupIdAndUserUsername(Long groupId, String username);

  List<GroupMember> findAllByGroup(Group group);

  List<GroupMember> findAllByUser(User user);

  void deleteByGroupAndUser(Group group, User userId);

  long countByGroupAndRole(Group group, Role role);

  @Query(
      """
      select gm.group.id as groupId, count(gm.id) as memberCount
      from GroupMember gm
      where gm.group.id in :groupIds
      group by gm.group.id
      """)
  List<GroupMemberCount> countMembersByGroupIds(@Param("groupIds") Collection<Long> groupIds);

  interface GroupMemberCount {
    Long getGroupId();

    long getMemberCount();
  }
}
