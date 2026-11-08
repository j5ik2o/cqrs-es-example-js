#!/usr/bin/env bash
# Resilience scenario, split so the host can stop, start and restart the RMU
# around it. `write` produces head-stream records while the RMU is stopped;
# `verify` waits for the read model to catch up and stay duplicate-free.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib.sh"

RESILIENCE_GROUP_CHAT_NAME=${RESILIENCE_GROUP_CHAT_NAME:-resilience-check}
SCENARIO=${E2E_SCENARIO:-}
GROUP_CHAT_ID=""
MESSAGE_ID=""

create_group_chat() {
  local result
  result=$(post_write_api \
    'mutation CreateGroupChat($input: CreateGroupChatInput!) { createGroupChat(input: $input) { groupChatId } }' \
    "{\"input\":{\"name\":\"${RESILIENCE_GROUP_CHAT_NAME}\",\"executorId\":\"${ADMIN_ID}\"}}")
  assert_no_errors "${result}" "createGroupChat"
  GROUP_CHAT_ID=$(printf '%s' "${result}" | jq -r '.data.createGroupChat.groupChatId')
}

add_member() {
  local result
  result=$(post_write_api \
    'mutation AddMember($input: AddMemberInput!) { addMember(input: $input) { groupChatId } }' \
    "{\"input\":{\"groupChatId\":\"${GROUP_CHAT_ID}\",\"userAccountId\":\"${USER_ACCOUNT_ID}\",\"role\":\"MEMBER\",\"executorId\":\"${ADMIN_ID}\"}}")
  assert_no_errors "${result}" "addMember"
}

post_message() {
  local content="$1"
  local result
  result=$(post_write_api \
    'mutation PostMessage($input: PostMessageInput!) { postMessage(input: $input) { groupChatId messageId } }' \
    "{\"input\":{\"groupChatId\":\"${GROUP_CHAT_ID}\",\"content\":\"${content}\",\"executorId\":\"${USER_ACCOUNT_ID}\"}}")
  assert_no_errors "${result}" "postMessage"
  printf '%s' "${result}" | jq -r '.data.postMessage.messageId'
}

edit_message() {
  local message_id="$1"
  local content="$2"
  local result
  result=$(post_write_api \
    'mutation EditMessage($input: EditMessageInput!) { editMessage(input: $input) { groupChatId } }' \
    "{\"input\":{\"groupChatId\":\"${GROUP_CHAT_ID}\",\"messageId\":\"${message_id}\",\"content\":\"${content}\",\"executorId\":\"${USER_ACCOUNT_ID}\"}}")
  assert_no_errors "${result}" "editMessage"
}

find_group_chat_id() {
  local i
  local response
  local id
  for i in $(seq 1 "${WAIT_READ_MODEL_ATTEMPTS}"); do
    response=$(post_read_api "{ getGroupChats(userAccountId: \"${ADMIN_ID}\") { id name } }") || true
    id=$(printf '%s' "${response}" | jq -r --arg name "${RESILIENCE_GROUP_CHAT_NAME}" \
      '.data.getGroupChats[]? | select(.name == $name) | .id' 2>/dev/null | head -n 1)
    if [ -n "${id}" ] && [ "${id}" != "null" ]; then
      echo "${id}"
      return 0
    fi
    sleep "${WAIT_READ_MODEL_SLEEP_SEC}"
  done
  fail "Timeout waiting for group chat ${RESILIENCE_GROUP_CHAT_NAME}"
}

case "${SCENARIO}" in
"write")
  wait_for_graphql "${WRITE_API_SERVER_BASE_URL}" "write-api"
  create_group_chat
  add_member
  MESSAGE_ID=$(post_message "resilience-1")
  edit_message "${MESSAGE_ID}" "resilience-1-edited"
  post_message "resilience-2" >/dev/null
  echo "RESILIENCE_WRITE_DONE groupChatId=${GROUP_CHAT_ID}"
  ;;
"verify")
  wait_for_graphql "${READ_API_SERVER_BASE_URL}" "read-api"
  GROUP_CHAT_ID=$(find_group_chat_id)
  echo "GROUP_CHAT_ID=${GROUP_CHAT_ID}"
  wait_for_read_model_member "${USER_ACCOUNT_ID}"
  poll_read_model "getMessages resilience" \
    "{ getMessages(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${ADMIN_ID}\") { id text } }" \
    '(.data.getMessages | length) == 2 and ([.data.getMessages[].text] | sort) == ["resilience-1-edited", "resilience-2"]'
  assert_read_model_contains "getGroupChat resilience" \
    "{ getGroupChat(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${ADMIN_ID}\") { id name } }" \
    ".data.getGroupChat.name == $(json_string "${RESILIENCE_GROUP_CHAT_NAME}")"
  assert_read_model_contains "getMembers resilience" \
    "{ getMembers(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${ADMIN_ID}\") { id userAccountId } }" \
    "(.data.getMembers | length) == 2"
  echo "RESILIENCE_VERIFY_DONE groupChatId=${GROUP_CHAT_ID}"
  ;;
*)
  fail "E2E_SCENARIO must be 'write' or 'verify' (got '${SCENARIO}')"
  ;;
esac
