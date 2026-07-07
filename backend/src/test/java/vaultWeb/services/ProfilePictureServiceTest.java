package vaultWeb.services;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import vaultWeb.exceptions.InvalidFileException;

class ProfilePictureServiceTest {

  @TempDir Path uploadDir;

  @Test
  void shouldStoreImageWithExtensionDetectedFromFileBytes() throws Exception {
    ProfilePictureService service = createService();
    MockMultipartFile file =
        new MockMultipartFile(
            "file",
            "avatar.html",
            "image/png",
            new byte[] {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A});

    String publicPath = service.store(file, 42L);

    assertTrue(publicPath.startsWith("uploads/profile-pictures/42_"));
    assertTrue(publicPath.endsWith(".png"));
    assertFalse(publicPath.endsWith(".html"));
    assertTrue(Files.exists(uploadDir.resolve(Path.of(publicPath).getFileName())));
  }

  @Test
  void shouldRejectFilesWithInvalidImageBytes() {
    ProfilePictureService service = createService();
    MockMultipartFile file =
        new MockMultipartFile("file", "avatar.png", "image/png", "not an image".getBytes());

    assertThrows(InvalidFileException.class, () -> service.store(file, 42L));
  }

  @Test
  void shouldDeleteOnlyStoredPublicProfilePicturePaths() throws Exception {
    ProfilePictureService service = createService();
    Path storedFile = uploadDir.resolve("42_avatar.png");
    Files.writeString(storedFile, "image");

    service.delete("uploads/profile-pictures/42_avatar.png");

    assertFalse(Files.exists(storedFile));
  }

  private ProfilePictureService createService() {
    ProfilePictureService service = new ProfilePictureService();
    ReflectionTestUtils.setField(service, "uploadDir", uploadDir.toString());
    ReflectionTestUtils.setField(service, "maxSizeMb", 2);
    return service;
  }
}
