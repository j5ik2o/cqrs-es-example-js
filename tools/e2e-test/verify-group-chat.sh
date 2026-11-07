#!/usr/bin/env bash
# Main scenario: every Write API mutation, then the Read API result after the
# RMU projects it. Each read waits by polling; no fixed sleep decides success.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib.sh"

GROUP_CHAT_ID=""
MESSAGE_ID=""

wait_for_graphql "${WRITE_API_SERVER_BASE_URL}" "write-api"
wait_for_graphql "${READ_API_SERVER_BASE_URL}" "read-api"

echo -e "\nCreate GroupChat(${ADMIN_ID}):"
CREATE_GROUP_CHAT_RESULT=$(post_write_api \
  'mutation CreateGroupChat($input: CreateGroupChatInput!) { createGroupChat(input: $input) { groupChatId } }' \
  "{\"input\":{\"name\":\"group-chat-example\",\"executorId\":\"${ADMIN_ID}\"}}")
assert_no_errors "${CREATE_GROUP_CHAT_RESULT}" "createGroupChat"
echo "Result: ${CREATE_GROUP_CHAT_RESULT}"
GROUP_CHAT_ID=$(printf '%s' "${CREATE_GROUP_CHAT_RESULT}" | jq -r '.data.createGroupChat.groupChatId')
echo "GROUP_CHAT_ID=${GROUP_CHAT_ID}"

echo -e "\nAdd Member(${GROUP_CHAT_ID}, ${USER_ACCOUNT_ID}, ${ADMIN_ID}):"
ADD_MEMBER_RESULT=$(post_write_api \
  'mutation AddMember($input: AddMemberInput!) { addMember(input: $input) { groupChatId } }' \
  "{\"input\":{\"groupChatId\":\"${GROUP_CHAT_ID}\",\"userAccountId\":\"${USER_ACCOUNT_ID}\",\"role\":\"MEMBER\",\"executorId\":\"${ADMIN_ID}\"}}")
assert_no_errors "${ADD_MEMBER_RESULT}" "addMember"
echo "Result: ${ADD_MEMBER_RESULT}"

echo -e "\nPost Message(${GROUP_CHAT_ID}, ${USER_ACCOUNT_ID}):"
POST_MESSAGE_RESULT=$(post_write_api \
  'mutation PostMessage($input: PostMessageInput!) { postMessage(input: $input) { groupChatId messageId } }' \
  "{\"input\":{\"groupChatId\":\"${GROUP_CHAT_ID}\",\"content\":\"Text1\",\"executorId\":\"${USER_ACCOUNT_ID}\"}}")
assert_no_errors "${POST_MESSAGE_RESULT}" "postMessage"
echo "Result: ${POST_MESSAGE_RESULT}"
MESSAGE_ID=$(printf '%s' "${POST_MESSAGE_RESULT}" | jq -r '.data.postMessage.messageId')
echo "MESSAGE_ID=${MESSAGE_ID}"

echo -e "\nEdit Message(${GROUP_CHAT_ID}, ${MESSAGE_ID}, ${USER_ACCOUNT_ID}):"
EDIT_MESSAGE_RESULT=$(post_write_api \
  'mutation EditMessage($input: EditMessageInput!) { editMessage(input: $input) { groupChatId } }' \
  "{\"input\":{\"groupChatId\":\"${GROUP_CHAT_ID}\",\"messageId\":\"${MESSAGE_ID}\",\"content\":\"Text1-edited\",\"executorId\":\"${USER_ACCOUNT_ID}\"}}")
assert_no_errors "${EDIT_MESSAGE_RESULT}" "editMessage"
echo "Result: ${EDIT_MESSAGE_RESULT}"

wait_for_read_model_group_chat "group-chat-example"
wait_for_read_model_member "${USER_ACCOUNT_ID}"
wait_for_read_model_message_text "Text1-edited"

echo -e "\nGet GroupChat(${GROUP_CHAT_ID}, ${ADMIN_ID}):"
assert_read_model_contains "getGroupChat" \
  "{ getGroupChat(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${ADMIN_ID}\") { id name ownerId createdAt updatedAt } }" \
  ".data.getGroupChat.id == $(json_string "${GROUP_CHAT_ID}") and .data.getGroupChat.name == \"group-chat-example\" and .data.getGroupChat.ownerId == $(json_string "${ADMIN_ID}")"

echo -e "\nGet GroupChats(${ADMIN_ID}):"
assert_read_model_contains "getGroupChats" \
  "{ getGroupChats(userAccountId: \"${ADMIN_ID}\") { id name } }" \
  "any(.data.getGroupChats[]; .id == $(json_string "${GROUP_CHAT_ID}") and .name == \"group-chat-example\")"

echo -e "\nGet Member(${GROUP_CHAT_ID}, ${USER_ACCOUNT_ID}):"
assert_read_model_contains "getMember" \
  "{ getMember(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${USER_ACCOUNT_ID}\") { id groupChatId userAccountId role } }" \
  ".data.getMember.userAccountId == $(json_string "${USER_ACCOUNT_ID}") and .data.getMember.role == \"member\""

echo -e "\nGet Members(${GROUP_CHAT_ID}, ${ADMIN_ID}):"
assert_read_model_contains "getMembers" \
  "{ getMembers(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${ADMIN_ID}\") { id userAccountId role } }" \
  "(.data.getMembers | length) == 2"

echo -e "\nGet Message(${MESSAGE_ID}, ${USER_ACCOUNT_ID}):"
assert_read_model_contains "getMessage" \
  "{ getMessage(messageId: \"${MESSAGE_ID}\", userAccountId: \"${USER_ACCOUNT_ID}\") { id groupChatId text userAccountId } }" \
  ".data.getMessage.id == $(json_string "${MESSAGE_ID}") and .data.getMessage.text == \"Text1-edited\" and .data.getMessage.userAccountId == $(json_string "${USER_ACCOUNT_ID}")"

echo -e "\nGet Messages(${GROUP_CHAT_ID}, ${USER_ACCOUNT_ID}):"
assert_read_model_contains "getMessages" \
  "{ getMessages(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${USER_ACCOUNT_ID}\") { id text } }" \
  "(.data.getMessages | length) == 1 and .data.getMessages[0].text == \"Text1-edited\""

echo -e "\nRename GroupChat(${GROUP_CHAT_ID}, ${ADMIN_ID}):"
RENAME_GROUP_CHAT_RESULT=$(post_write_api \
  'mutation RenameGroupChat($input: RenameGroupChatInput!) { renameGroupChat(input: $input) { groupChatId } }' \
  "{\"input\":{\"groupChatId\":\"${GROUP_CHAT_ID}\",\"name\":\"group-chat-example-2\",\"executorId\":\"${ADMIN_ID}\"}}")
assert_no_errors "${RENAME_GROUP_CHAT_RESULT}" "renameGroupChat"
echo "Result: ${RENAME_GROUP_CHAT_RESULT}"
wait_for_read_model_group_chat "group-chat-example-2"

echo -e "\nDelete Message(${GROUP_CHAT_ID}, ${MESSAGE_ID}, ${USER_ACCOUNT_ID}):"
DELETE_MESSAGE_RESULT=$(post_write_api \
  'mutation DeleteMessage($input: DeleteMessageInput!) { deleteMessage(input: $input) { groupChatId } }' \
  "{\"input\":{\"groupChatId\":\"${GROUP_CHAT_ID}\",\"messageId\":\"${MESSAGE_ID}\",\"executorId\":\"${USER_ACCOUNT_ID}\"}}")
assert_no_errors "${DELETE_MESSAGE_RESULT}" "deleteMessage"
echo "Result: ${DELETE_MESSAGE_RESULT}"
wait_for_read_model_message_absent
assert_read_model_contains "getMessages after deleteMessage" \
  "{ getMessages(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${USER_ACCOUNT_ID}\") { id } }" \
  "(.data.getMessages | length) == 0"

echo -e "\nRemove Member(${GROUP_CHAT_ID}, ${USER_ACCOUNT_ID}, ${ADMIN_ID}):"
REMOVE_MEMBER_RESULT=$(post_write_api \
  'mutation RemoveMember($input: RemoveMemberInput!) { removeMember(input: $input) { groupChatId } }' \
  "{\"input\":{\"groupChatId\":\"${GROUP_CHAT_ID}\",\"userAccountId\":\"${USER_ACCOUNT_ID}\",\"executorId\":\"${ADMIN_ID}\"}}")
assert_no_errors "${REMOVE_MEMBER_RESULT}" "removeMember"
echo "Result: ${REMOVE_MEMBER_RESULT}"
wait_for_read_model_member_absent "${USER_ACCOUNT_ID}"
assert_read_model_contains "getMembers after removeMember" \
  "{ getMembers(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${ADMIN_ID}\") { id userAccountId role } }" \
  "(.data.getMembers | length) == 1 and .data.getMembers[0].userAccountId == $(json_string "${ADMIN_ID}")"

echo -e "\nDelete GroupChat(${GROUP_CHAT_ID}, ${ADMIN_ID}):"
DELETE_GROUP_CHAT_RESULT=$(post_write_api \
  'mutation DeleteGroupChat($input: DeleteGroupChatInput!) { deleteGroupChat(input: $input) { groupChatId } }' \
  "{\"input\":{\"groupChatId\":\"${GROUP_CHAT_ID}\",\"executorId\":\"${ADMIN_ID}\"}}")
assert_no_errors "${DELETE_GROUP_CHAT_RESULT}" "deleteGroupChat"
echo "Result: ${DELETE_GROUP_CHAT_RESULT}"
wait_for_read_model_group_chat_absent
assert_read_model_contains "getGroupChats after deleteGroupChat" \
  "{ getGroupChats(userAccountId: \"${ADMIN_ID}\") { id } }" \
  "all(.data.getGroupChats[]; .id != $(json_string "${GROUP_CHAT_ID}"))"

echo -e "\nMain e2e scenario completed"
