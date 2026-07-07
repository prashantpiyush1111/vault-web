package vaultWeb.models;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import vaultWeb.security.annotations.SecurityEventType;

@Entity
@Data
@AllArgsConstructor
@NoArgsConstructor
@Table(name = "security_event")
public class SecurityEvent {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id")
  private User user;

  private String username;

  @Enumerated(EnumType.STRING)
  private SecurityEventType eventType;

  private String status;

  private Instant timestamp;

  private String ipAddress;

  private String deviceId;

  @Column(columnDefinition = "TEXT")
  private String userAgent;

  private String location;
}
