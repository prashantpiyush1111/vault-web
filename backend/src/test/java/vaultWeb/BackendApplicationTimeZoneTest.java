package vaultWeb;

import static org.junit.jupiter.api.Assertions.*;

import java.util.TimeZone;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class BackendApplicationTimeZoneTest {

  private TimeZone originalDefault;

  @BeforeEach
  void captureOriginalTimeZone() {
    originalDefault = TimeZone.getDefault();
  }

  @AfterEach
  void restoreOriginalTimeZone() {
    TimeZone.setDefault(originalDefault);
  }

  @Test
  void pinsJvmDefaultTimeZoneToUtcWhenNoOverrideIsConfigured() {
    TimeZone.setDefault(TimeZone.getTimeZone("Asia/Calcutta"));

    BackendApplication.pinDefaultTimeZone();

    assertEquals(TimeZone.getTimeZone("UTC"), TimeZone.getDefault());
  }
}
