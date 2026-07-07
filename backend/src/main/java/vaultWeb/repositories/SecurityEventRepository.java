package vaultWeb.repositories;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import vaultWeb.models.SecurityEvent;
import vaultWeb.models.User;

@Repository
public interface SecurityEventRepository extends JpaRepository<SecurityEvent, Long> {
  List<SecurityEvent> findTop50ByUserOrderByTimestampDesc(User user);
}
