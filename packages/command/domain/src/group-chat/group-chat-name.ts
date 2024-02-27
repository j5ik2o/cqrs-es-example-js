import * as E from "fp-ts/lib/Either";
const GroupChatNameTypeSymbol = Symbol("GroupChatName");

class GroupChatName {
  readonly symbol: typeof GroupChatNameTypeSymbol = GroupChatNameTypeSymbol;

  private constructor(public readonly value: string) {
    if (this.value.length === 0) {
      throw new Error("Group chat name cannot be empty");
    }
    if (this.value.length > 100) {
      throw new Error("Group chat name cannot be longer than 100 characters");
    }
  }

  toJSON() {
    return {
      value: this.value,
    };
  }

  asString() {
    return this.value;
  }
  toString() {
    return `GroupChatName(${this.value})`;
  }
  equals(anotherName: GroupChatName): boolean {
    return this.value === anotherName.value;
  }

  static validate(value: string): E.Either<string, GroupChatName> {
    try {
      return E.right(GroupChatName.of(value));
    } catch (error) {
      if (error instanceof Error) {
        return E.left(error.message);
      } else {
        throw error;
      }
    }
  }
  static of(value: string): GroupChatName {
    return new GroupChatName(value);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToGroupChatName(json: any): GroupChatName {
  return GroupChatName.of(json.value);
}

export { GroupChatName, GroupChatNameTypeSymbol, convertJSONToGroupChatName };
