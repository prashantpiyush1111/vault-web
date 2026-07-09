package vaultWeb.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;
import vaultWeb.dtos.user.UserDto;

@Entity
@Data
@AllArgsConstructor
@NoArgsConstructor
@Table(name = "vault_user")
@ToString(exclude = "groupMemberships")
public class User {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private String username;

  @JsonIgnore private String password;

  // Stores the relative file path to the user's profile picture.
  // Example value: "uploads/profile-pictures/42_abc123.jpg"
  // This will be null if the user has never uploaded a picture — that's perfectly fine!
  // The @Column annotation with nullable=true makes this explicit (null is the default anyway,
  // but being explicit makes the code easier to understand).
  @Column(nullable = true)
  private String profilePicture;

  @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
  @JsonIgnore
  private List<GroupMember> groupMemberships;

  public User(UserDto userDto) {
    username = userDto.getUsername();
    password = userDto.getPassword();
    groupMemberships = List.of();
  }
}
