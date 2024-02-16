const GroupChatNameSymbol = Symbol("GroupChatName");

class GroupChatName {
  readonly symbol: typeof GroupChatNameSymbol = GroupChatNameSymbol;

  constructor(private value: string) {}

  get asString(): string {
    return this.value;
  }
}

export { GroupChatName };
