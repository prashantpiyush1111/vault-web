package vaultWeb;

import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Main entry point for the backend application.
 *
 * <p>This class bootstraps the Spring Boot application and configures essential Spring features
 * such as Aspect-Oriented Programming (AOP) support.
 *
 * <p>Key Annotations:
 *
 * <ul>
 *   <li>{@link SpringBootApplication} – Marks this class as a Spring Boot application and enables
 *       component scanning, auto-configuration, and property support.
 *   <li>{@link EnableAspectJAutoProxy} – Enables support for handling components marked with
 *       AspectJ's @Aspect annotation for AOP functionality.
 * </ul>
 *
 * <p>Implements {@link WebMvcConfigurer} to allow optional customization of Spring MVC
 * configuration.
 */
@EnableScheduling
@EnableAspectJAutoProxy
@SpringBootApplication
public class BackendApplication implements WebMvcConfigurer {

  /**
   * Main method that serves as the entry point of the Spring Boot application.
   *
   * @param args Command-line arguments passed to the application.
   */
  public static void main(String[] args) {
    pinDefaultTimeZone();
    SpringApplication.run(BackendApplication.class, args);
  }

  // The PostgreSQL driver sends the JVM's default timezone id during the JDBC handshake, before
  // Hibernate's hibernate.jdbc.time_zone setting ever applies. On JDKs whose tzdata resolves to a
  // deprecated alias (e.g. "Asia/Calcutta" instead of "Asia/Kolkata"), recent PostgreSQL versions
  // reject that value outright and the app fails to start. Pinning the default here removes the
  // dependency on the host's tzdata.
  static void pinDefaultTimeZone() {
    String timeZoneId = System.getenv().getOrDefault("APP_TIMEZONE", "UTC");
    TimeZone.setDefault(TimeZone.getTimeZone(timeZoneId));
  }
}
