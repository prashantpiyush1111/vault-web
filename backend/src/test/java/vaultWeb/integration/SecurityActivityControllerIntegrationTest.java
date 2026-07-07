package vaultWeb.integration;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import vaultWeb.models.SecurityEvent;
import vaultWeb.models.User;
import vaultWeb.security.JwtUtil;
import vaultWeb.security.annotations.SecurityEventType;

class SecurityActivityControllerIntegrationTest extends IntegrationTestBase {

  @Autowired private JwtUtil jwtUtil;

  private static final String TEST_USERNAME = "audituser";
  private static final String TEST_PASSWORD = "Password123!";

  private String getAuthHeader(User user) {
    String token = jwtUtil.generateToken(user);
    return "Bearer " + token;
  }

  private User createTestUser() {
    User user = new User();
    user.setUsername(TEST_USERNAME);
    user.setPassword("hashedpassword");
    return userRepository.save(user);
  }

  @Test
  void testGetSecurityActivity_Unauthorized() throws Exception {
    mockMvc.perform(get("/api/auth/security-activity")).andExpect(status().isUnauthorized());
  }

  @Test
  void testGetSecurityActivity_Success() throws Exception {
    User user = createTestUser();
    String authHeader = getAuthHeader(user);

    // Seed some mock security events
    SecurityEvent event1 = new SecurityEvent();
    event1.setUser(user);
    event1.setUsername(user.getUsername());
    event1.setEventType(SecurityEventType.LOGIN);
    event1.setStatus("SUCCESS");
    event1.setTimestamp(java.time.Instant.now().minusSeconds(10));
    event1.setIpAddress("127.0.0.1");
    event1.setUserAgent("TestAgent");
    event1.setLocation("Localhost");
    securityEventRepository.save(event1);

    SecurityEvent event2 = new SecurityEvent();
    event2.setUser(user);
    event2.setUsername(user.getUsername());
    event2.setEventType(SecurityEventType.PASSWORD_CHANGE);
    event2.setStatus("SUCCESS");
    event2.setTimestamp(java.time.Instant.now());
    event2.setIpAddress("127.0.0.1");
    event2.setDeviceId("device-2");
    event2.setUserAgent("TestAgent");
    event2.setLocation("Localhost");
    securityEventRepository.save(event2);

    mockMvc
        .perform(get("/api/auth/security-activity").header("Authorization", authHeader))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(2)))
        .andExpect(jsonPath("$[0].eventType").value("PASSWORD_CHANGE"))
        .andExpect(jsonPath("$[0].deviceId").value("device-2"))
        .andExpect(jsonPath("$[1].eventType").value("LOGIN"));
  }

  @Test
  void testLogSecurityEvent_Success() throws Exception {
    User user = createTestUser();
    String authHeader = getAuthHeader(user);

    Map<String, String> payload = Map.of("eventType", "VAULT_UNLOCKED");

    mockMvc
        .perform(
            post("/api/auth/security-activity/log")
                .header("Authorization", authHeader)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
        .andExpect(status().isOk());

    List<SecurityEvent> events = securityEventRepository.findAll();
    assertEquals(1, events.size());
    SecurityEvent event = events.get(0);
    assertEquals(SecurityEventType.VAULT_UNLOCKED, event.getEventType());
    assertEquals("SUCCESS", event.getStatus());
    assertEquals(user.getUsername(), event.getUsername());
  }

  @Test
  void testLogSecurityEvent_ForgeryPrevention() throws Exception {
    User user = createTestUser();
    String authHeader = getAuthHeader(user);

    // Try logging LOGIN, which is server-only and should be blocked from client endpoint
    Map<String, String> payload = Map.of("eventType", "LOGIN");

    mockMvc
        .perform(
            post("/api/auth/security-activity/log")
                .header("Authorization", authHeader)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
        .andExpect(status().isBadRequest());

    // Try logging invalid event
    Map<String, String> payload2 = Map.of("eventType", "INVALID_EVENT");

    mockMvc
        .perform(
            post("/api/auth/security-activity/log")
                .header("Authorization", authHeader)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload2)))
        .andExpect(status().isBadRequest());

    List<SecurityEvent> events = securityEventRepository.findAll();
    assertTrue(events.isEmpty());
  }
}
