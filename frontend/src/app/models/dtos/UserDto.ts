// This interface mirrors the UserResponseDto from the backend.
// Every field here must match what the backend sends in its JSON response.
export interface UserDto {
  id: number;
  username: string;
  // The relative path to the user's profile picture on the backend server.
  // Will be null/undefined if the user hasn't uploaded a picture yet.
  // The '?' makes it optional so TypeScript doesn't complain about old responses.
  profilePicture?: string | null;
}
