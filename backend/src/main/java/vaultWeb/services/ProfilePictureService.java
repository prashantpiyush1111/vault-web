package vaultWeb.services;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import vaultWeb.exceptions.InvalidFileException;

/** Service responsible for file-system operations related to profile pictures. */
@Service
public class ProfilePictureService {

  @Value("${app.upload.profile-picture.dir}")
  private String uploadDir;

  @Value("${app.upload.profile-picture.max-size-mb}")
  private int maxSizeMb;

  private static final String PUBLIC_PROFILE_PICTURE_PATH = "uploads/profile-pictures";
  private static final Set<String> ALLOWED_TYPES = Set.of("image/jpeg", "image/png", "image/webp");

  /** Validates and stores an uploaded profile picture on disk. */
  public String store(MultipartFile file, Long userId) throws IOException {
    ValidatedImage image = validateFile(file);

    Path uploadPath = Paths.get(uploadDir).toAbsolutePath().normalize();
    Files.createDirectories(uploadPath);

    String uniqueFilename = userId + "_" + UUID.randomUUID() + image.extension();

    Path targetPath = uploadPath.resolve(uniqueFilename).normalize();
    if (!targetPath.startsWith(uploadPath)) {
      throw new InvalidFileException("Invalid upload path.");
    }

    Files.write(targetPath, image.bytes());

    return PUBLIC_PROFILE_PICTURE_PATH + "/" + uniqueFilename;
  }

  /** Deletes a profile picture file from disk. */
  public void delete(String publicPath) {
    if (publicPath == null || publicPath.isBlank()) {
      return; // Nothing to delete
    }

    if (!publicPath.startsWith(PUBLIC_PROFILE_PICTURE_PATH + "/")) {
      return;
    }

    Path uploadPath = Paths.get(uploadDir).toAbsolutePath().normalize();
    Path filename =
        Paths.get(publicPath.substring(PUBLIC_PROFILE_PICTURE_PATH.length() + 1)).getFileName();
    if (filename == null) {
      return;
    }

    Path filePath = uploadPath.resolve(filename).normalize();
    if (!filePath.startsWith(uploadPath)) {
      return;
    }

    try {
      Files.deleteIfExists(filePath);
    } catch (IOException e) {
      System.err.println(
          "Warning: Could not delete profile picture file: " + publicPath + " — " + e.getMessage());
    }
  }

  // ── Private helper methods ──────────────────────────────────────────────────

  /** Validates that the uploaded file is an accepted image type and within the size limit. */
  private ValidatedImage validateFile(MultipartFile file) throws IOException {
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

    byte[] bytes = file.getBytes();
    String extension = detectImageExtension(bytes);
    if (extension == null) {
      throw new InvalidFileException(
          "Invalid image file. Only JPEG, PNG, and WebP images are allowed.");
    }

    return new ValidatedImage(bytes, extension);
  }

  /** Detects the image type from magic bytes instead of trusting the user-supplied filename. */
  private String detectImageExtension(byte[] bytes) {
    if (bytes.length >= 3
        && bytes[0] == (byte) 0xFF
        && bytes[1] == (byte) 0xD8
        && bytes[2] == (byte) 0xFF) {
      return ".jpg";
    }

    if (bytes.length >= 8
        && bytes[0] == (byte) 0x89
        && bytes[1] == 0x50
        && bytes[2] == 0x4E
        && bytes[3] == 0x47
        && bytes[4] == 0x0D
        && bytes[5] == 0x0A
        && bytes[6] == 0x1A
        && bytes[7] == 0x0A) {
      return ".png";
    }

    if (bytes.length >= 12
        && bytes[0] == 0x52
        && bytes[1] == 0x49
        && bytes[2] == 0x46
        && bytes[3] == 0x46
        && bytes[8] == 0x57
        && bytes[9] == 0x45
        && bytes[10] == 0x42
        && bytes[11] == 0x50) {
      return ".webp";
    }

    return null;
  }

  private record ValidatedImage(byte[] bytes, String extension) {}
}
