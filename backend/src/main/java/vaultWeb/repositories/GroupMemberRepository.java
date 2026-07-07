package vaultWeb.repositories;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
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

  long countByGroup(Group group);
}
