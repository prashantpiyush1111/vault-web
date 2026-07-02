package vaultWeb.services;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import vaultWeb.exceptions.InvalidFileException;

/**
 * Service responsible for file-system operations related to profile pictures.
 */
@Service
public class ProfilePictureService {

  @Value("${app.upload.profile-picture.dir}")
  private String uploadDir;

  @Value("${app.upload.profile-picture.max-size-mb}")
  private int maxSizeMb;

  private static final Set<String> ALLOWED_TYPES =
      Set.of("image/jpeg", "image/png", "image/webp");

  /**
   * Validates and stores an uploaded profile picture on disk.
   */
  public String store(MultipartFile file, Long userId) throws IOException {
    validateFile(file);

    Path uploadPath = Paths.get(uploadDir);
    if (!Files.exists(uploadPath)) {
      Files.createDirectories(uploadPath);
    }

    String originalFilename = file.getOriginalFilename();
    String extension = getExtension(originalFilename);
    String uniqueFilename = userId + "_" + UUID.randomUUID() + extension;

    Path targetPath = uploadPath.resolve(uniqueFilename);
    Files.copy(file.getInputStream(), targetPath, StandardCopyOption.REPLACE_EXISTING);

    return uploadDir + "/" + uniqueFilename;
  }

  /**
   * Deletes a profile picture file from disk.
   */
  public void delete(String relativePath) {
    if (relativePath == null || relativePath.isBlank()) {
      return; // Nothing to delete
    }

    Path filePath = Paths.get(relativePath);
    try {
      Files.deleteIfExists(filePath);
    } catch (IOException e) {
      System.err.println("Warning: Could not delete profile picture file: " + relativePath + " — " + e.getMessage());
    }
  }

  // ── Private helper methods ──────────────────────────────────────────────────

  /**
   * Validates that the uploaded file is an accepted type and within the size limit.
   */
  private void validateFile(MultipartFile file) {
    if (file == null || file.isEmpty()) {
      throw new InvalidFileException("Please select a file to upload.");
    }

    String contentType = file.getContentType();
    if (contentType == null || !ALLOWED_TYPES.contains(contentType)) {
      throw new InvalidFileException(
          "Invalid file type. Only JPEG, PNG, and WebP images are allowed.");
    }

    long maxSizeBytes = (long) maxSizeMb * 1024 * 1024;
    if (file.getSize() > maxSizeBytes) {
      throw new InvalidFileException(
          "File is too large. Maximum allowed size is " + maxSizeMb + " MB.");
    }
  }

  /**
   * Extracts the file extension from a filename.
   */
  private String getExtension(String filename) {
    if (filename == null || !filename.contains(".")) {
      return "";
    }
    return filename.substring(filename.lastIndexOf(".")).toLowerCase();
  }
}
