package vaultWeb.models;

public record PollContext(Group group, PrivateChat privateChat) {
  public PollContext {
    boolean hasGroup = group != null;
    boolean hasPrivateChat = privateChat != null;
    if (hasGroup == hasPrivateChat) {
      throw new IllegalArgumentException(
          "PollContext must contain exactly one group or private chat");
    }
  }

  public boolean isGroup() {
    return group != null;
  }

  public boolean isPrivateChat() {
    return privateChat != null;
  }
}
