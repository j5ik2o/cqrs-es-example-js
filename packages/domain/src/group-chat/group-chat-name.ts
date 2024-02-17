const GroupChatNameSymbol = Symbol("GroupChatName");

class GroupChatName {
  readonly symbol: typeof GroupChatNameSymbol = GroupChatNameSymbol;

  private constructor(private value: string) {}

  static of(value: string): GroupChatName {
    return new GroupChatName(value);
  }

  get asString(): string {
    return this.value;
  }

  equals(other: GroupChatName): boolean {
    return this.value === other.value;
  }
}

export { GroupChatName };
