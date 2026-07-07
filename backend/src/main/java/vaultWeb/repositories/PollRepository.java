package vaultWeb.repositories;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import vaultWeb.models.Poll;

public interface PollRepository extends JpaRepository<Poll, Long> {
  List<Poll> findByGroupId(Long groupId);

  List<Poll> findByGroupIdIn(List<Long> groupIds);

  List<Poll> findByPrivateChatId(Long privateChatId);
}
