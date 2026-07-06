package vaultWeb.dtos.user;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import vaultWeb.models.User;

/**
 * A "safe" version of the User object that we send to the frontend. We never send the full User
 * entity (it contains the password hash!). This DTO only contains fields that are safe to share
 * publicly.
 */
@Data
@AllArgsConstructor
@NoArgsConstructor
public class UserResponseDto {
  private Long id;
  private String username;

  // The relative path to the user's profile picture, e.g. "uploads/profile-pictures/42_abc.jpg"
  // This will be null if the user has not uploaded a picture yet.
  private String profilePicture;

  public UserResponseDto(User user) {
    this.id = user.getId();
    this.username = user.getUsername();
    // getProfilePicture() returns null if no picture is set — that's handled by the frontend
    this.profilePicture = user.getProfilePicture();
  }
}
