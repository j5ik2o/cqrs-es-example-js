import * as E from "fp-ts/lib/Either";
const GroupChatNameTypeSymbol = Symbol("GroupChatName");

class GroupChatName {
  readonly symbol: typeof GroupChatNameTypeSymbol = GroupChatNameTypeSymbol;

  private _value: string;
  private constructor(value: string) {
    if (value.length === 0) {
      throw new Error("Group chat name cannot be empty");
    }
    if (value.length > 100) {
      throw new Error("Group chat name cannot be longer than 100 characters");
    }
    this._value = value;
  }

  get value() {
    return this._value;
  }
  asString() {
    return this._value;
  }
  toString() {
    return `GroupChatName(${this._value})`;
  }
  equals(anotherName: GroupChatName): boolean {
    return this._value === anotherName._value;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static convertJSONToGroupChatName(json: any): GroupChatName {
    return GroupChatName.of(json.value);
  }
}

export { GroupChatName, GroupChatNameTypeSymbol };
