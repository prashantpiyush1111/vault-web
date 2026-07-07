package vaultWeb.exceptions;

/** Thrown when an uploaded file fails validation. */
public class InvalidFileException extends RuntimeException {

  /** Constructs a new InvalidFileException. */
  public InvalidFileException(String message) {
    super(message);
  }
}
