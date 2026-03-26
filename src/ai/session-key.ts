export function getGuildIdFromConversationKey(conversationKey: string): string {
  const separatorIndex = conversationKey.indexOf(":");
  if (separatorIndex < 0) {
    return conversationKey;
  }

  return conversationKey.slice(0, separatorIndex);
}
