package vaultWeb.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Configures Spring MVC to serve static files from the local filesystem. */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

  @Value("${app.upload.profile-picture.dir}")
  private String uploadDir;

  /** Registers a URL path pattern to serve files from the local uploads directory. */
  @Override
  public void addResourceHandlers(ResourceHandlerRegistry registry) {
    registry
        .addResourceHandler("/uploads/profile-pictures/**")
        .addResourceLocations("file:" + uploadDir + "/");
  }
}
