#!/usr/bin/env bash
# Shared helpers for the Docker Compose e2e scenarios.

ADMIN_ID=${ADMIN_ID:-UserAccount-01H42K4ABWQ5V2XQEP3A48VE0Z}
USER_ACCOUNT_ID=${USER_ACCOUNT_ID:-UserAccount-01H7C6DWMK1BKS1JYH1XZE529M}
WRITE_API_SERVER_BASE_URL=${WRITE_API_SERVER_BASE_URL:-http://localhost:38080}
READ_API_SERVER_BASE_URL=${READ_API_SERVER_BASE_URL:-http://localhost:38082}

WAIT_GRAPHQL_ATTEMPTS=${WAIT_GRAPHQL_ATTEMPTS:-60}
WAIT_GRAPHQL_SLEEP_SEC=${WAIT_GRAPHQL_SLEEP_SEC:-1}
WAIT_READ_MODEL_ATTEMPTS=${WAIT_READ_MODEL_ATTEMPTS:-90}
WAIT_READ_MODEL_SLEEP_SEC=${WAIT_READ_MODEL_SLEEP_SEC:-2}

fail() {
  echo "Error: $*" >&2
  exit 1
}

# Builds a GraphQL request body with jq so IDs and query text never need to be
# escaped by hand.
post_graphql() {
  local base_url="$1"
  local query="$2"
  local variables="${3:-}"
  local body
  if [ -z "${variables}" ]; then
    variables='{}'
  fi
  body=$(jq -cn --arg query "${query}" --argjson variables "${variables}" \
    '{query: $query, variables: $variables}') ||
    fail "variables is not valid JSON: ${variables}"
  curl -sS -X POST -H "Content-Type: application/json" "${base_url}/" -d "${body}"
}

post_write_api() {
  post_graphql "${WRITE_API_SERVER_BASE_URL}" "$1" "${2:-}"
}

post_read_api() {
  post_graphql "${READ_API_SERVER_BASE_URL}" "$1" "${2:-}"
}

require_json() {
  local response="$1"
  local label="$2"
  if [ -z "${response}" ] || ! printf '%s' "${response}" | jq -e . >/dev/null 2>&1; then
    fail "${label}: response is not valid JSON: ${response}"
  fi
}

assert_no_errors() {
  local response="$1"
  local label="$2"
  require_json "${response}" "${label}"
  if printf '%s' "${response}" | jq -e '.errors != null and (.errors | length) > 0' >/dev/null; then
    fail "${label}: ${response}"
  fi
}

wait_for_graphql() {
  local base_url="$1"
  local label="$2"
  local i
  local code
  for i in $(seq 1 "${WAIT_GRAPHQL_ATTEMPTS}"); do
    code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${base_url}/" \
      -H "Content-Type: application/json" \
      -d '{"query":"{ __typename }"}') || true
    if [ "${code}" = "200" ]; then
      echo "Ready: ${label} (${base_url})"
      return 0
    fi
    sleep "${WAIT_GRAPHQL_SLEEP_SEC}"
  done
  fail "Timeout waiting for ${label} at ${base_url}"
}

# Polls a read query until its jq condition is true. The condition must be a
# jq expression evaluated against the whole GraphQL response.
poll_read_model() {
  local label="$1"
  local query="$2"
  local condition="$3"
  local i
  local response=""
  for i in $(seq 1 "${WAIT_READ_MODEL_ATTEMPTS}"); do
    response=$(post_read_api "${query}") || true
    if printf '%s' "${response}" | jq -e "${condition}" >/dev/null 2>&1; then
      echo "Read model OK (${label})"
      return 0
    fi
    sleep "${WAIT_READ_MODEL_SLEEP_SEC}"
  done
  fail "Timeout waiting for read model (${label}); last response: ${response}"
}

json_string() {
  jq -Rn --arg value "$1" '$value'
}

wait_for_read_model_group_chat() {
  local expect_name="${1:-}"
  local condition='.data.getGroupChat != null'
  if [ -n "${expect_name}" ]; then
    condition="${condition} and .data.getGroupChat.name == $(json_string "${expect_name}")"
  fi
  poll_read_model "getGroupChat${expect_name:+ name=${expect_name}}" \
    "{ getGroupChat(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${ADMIN_ID}\") { id name } }" \
    "${condition}"
}

wait_for_read_model_member() {
  local user_account_id="$1"
  poll_read_model "getMember ${user_account_id}" \
    "{ getMember(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${user_account_id}\") { id userAccountId role } }" \
    ".data.getMember != null and .data.getMember.userAccountId == $(json_string "${user_account_id}")"
}

wait_for_read_model_message_text() {
  local expect_text="$1"
  poll_read_model "getMessage text=${expect_text}" \
    "{ getMessage(messageId: \"${MESSAGE_ID}\", userAccountId: \"${USER_ACCOUNT_ID}\") { id text } }" \
    ".data.getMessage != null and .data.getMessage.text == $(json_string "${expect_text}")"
}

wait_for_read_model_group_chat_absent() {
  poll_read_model "getGroupChat absent" \
    "{ getGroupChat(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${ADMIN_ID}\") { id } }" \
    '((.errors // []) | any(.[]; .extensions.code == "404"))'
}

wait_for_read_model_member_absent() {
  local user_account_id="$1"
  poll_read_model "getMember absent ${user_account_id}" \
    "{ getMember(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${user_account_id}\") { id } }" \
    '((.errors // []) | any(.[]; .extensions.code == "404"))'
}

wait_for_read_model_message_absent() {
  poll_read_model "getMessage absent" \
    "{ getMessage(messageId: \"${MESSAGE_ID}\", userAccountId: \"${USER_ACCOUNT_ID}\") { id } }" \
    '((.errors // []) | any(.[]; .extensions.code == "404"))'
}

assert_read_model_contains() {
  local label="$1"
  local query="$2"
  local condition="$3"
  local response
  response=$(post_read_api "${query}")
  assert_no_errors "${response}" "${label}"
  if ! printf '%s' "${response}" | jq -e "${condition}" >/dev/null; then
    fail "${label}: assertion failed: ${condition}: ${response}"
  fi
  echo "${label} OK"
}
