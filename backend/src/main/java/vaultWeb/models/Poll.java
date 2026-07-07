package vaultWeb.models;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "polls")
public class Poll {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne
  @JoinColumn(name = "group_id")
  private Group group;

  @ManyToOne
  @JoinColumn(name = "private_chat_id", nullable = true)
  private PrivateChat privateChat;

  private String question;

  @Temporal(TemporalType.TIMESTAMP)
  private Instant createdAt;

  @ManyToOne
  @JoinColumn(name = "author_id", nullable = false)
  private User author;

  @Temporal(TemporalType.TIMESTAMP)
  private Instant deadline;

  private boolean isAnonymous;

  @OneToMany(mappedBy = "poll", cascade = CascadeType.ALL, orphanRemoval = true)
  @JsonManagedReference
  private List<PollOption> options;

  @PrePersist
  protected void onCreate() {
    this.createdAt = Instant.now();
  }
}
