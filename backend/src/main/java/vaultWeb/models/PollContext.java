package vaultWeb.models;

public record PollContext(Group group, PrivateChat privateChat) {
  public PollContext {
    if (isGroup() && isPrivateChat()) {
      throw new IllegalArgumentException("PollConext must contain either group or private chat");
    }
  }

  public boolean isGroup() {
    return group != null;
  }

  public boolean isPrivateChat() {
    return privateChat != null;
  }
}
