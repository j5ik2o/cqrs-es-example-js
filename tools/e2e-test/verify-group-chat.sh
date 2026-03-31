#!/usr/bin/env bash

set -ue

ADMIN_ID=${ADMIN_ID:-UserAccount-01H42K4ABWQ5V2XQEP3A48VE0Z}
USER_ACCOUNT_ID=${USER_ACCOUNT_ID:-UserAccount-01H7C6DWMK1BKS1JYH1XZE529M}
WRITE_API_SERVER_BASE_URL=${WRITE_API_SERVER_BASE_URL:-http://localhost:38080}
READ_API_SERVER_BASE_URL=${READ_API_SERVER_BASE_URL:-http://localhost:38082}

# GraphQL の listen 待ち（短めでよい）
WAIT_GRAPHQL_ATTEMPTS=${WAIT_GRAPHQL_ATTEMPTS:-45}
WAIT_GRAPHQL_SLEEP_SEC=${WAIT_GRAPHQL_SLEEP_SEC:-1}
# Lambda RMU → MySQL 投影は遅れうる。60×1s に縮めるとタイムアウトしやすいので 90×2s を既定のまま
WAIT_READ_MODEL_ATTEMPTS=${WAIT_READ_MODEL_ATTEMPTS:-90}
WAIT_READ_MODEL_SLEEP_SEC=${WAIT_READ_MODEL_SLEEP_SEC:-2}

# Compose 直後は API がまだ listen していないことがある（ホスト／コンテナ共通）
wait_for_graphql() {
  local base_url=$1
  local label=$2
  local i
  for i in $(seq 1 "${WAIT_GRAPHQL_ATTEMPTS}"); do
    # set -e でも接続失敗でループを継続する（curl は失敗時に非ゼロを返す）
    code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${base_url}/" \
      -H "Content-Type: application/json" \
      -d '{"query":"{ __typename }"}') || true
    if [ "$code" = "200" ]; then
      echo "Ready: ${label} (${base_url})"
      return 0
    fi
    sleep "${WAIT_GRAPHQL_SLEEP_SEC}"
  done
  echo "Timeout waiting for ${label} at ${base_url}" >&2
  exit 1
}

# DynamoDB ストリーム → Lambda RMU → MySQL 投影までの遅延を吸収する（GROUP_CHAT_ID / ADMIN_ID が設定済みであること）
wait_for_read_model_group_chat() {
  local expect_name="${1:-}"
  local i
  local r
  for i in $(seq 1 "${WAIT_READ_MODEL_ATTEMPTS}"); do
    r=$(curl -s -X POST -H "Content-Type: application/json" \
      "${READ_API_SERVER_BASE_URL}/" \
      -d "{\"query\": \"{ getGroupChat(groupChatId: \\\"${GROUP_CHAT_ID}\\\", userAccountId: \\\"${ADMIN_ID}\\\") { id name } }\"}") || true

    if echo "$r" | jq -e '.data.getGroupChat != null' >/dev/null 2>&1; then
      if [ -z "$expect_name" ] || echo "$r" | jq -e --arg n "$expect_name" '.data.getGroupChat.name == $n' >/dev/null 2>&1; then
        if [ -n "$expect_name" ]; then
          echo "Read model OK (name=${expect_name})"
        else
          echo "Read model OK (group chat visible)"
        fi
        return 0
      fi
    fi
    sleep "${WAIT_READ_MODEL_SLEEP_SEC}"
  done
  echo "Timeout waiting for read model (getGroupChat${expect_name:+ name=${expect_name}})" >&2
  exit 1
}

wait_for_graphql "${WRITE_API_SERVER_BASE_URL}" "write-api"
wait_for_graphql "${READ_API_SERVER_BASE_URL}" "read-api"

# グループチャット作成
echo -e "\nCreate GroupChat(${ADMIN_ID}):"
CREATE_GROUP_CHAT_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
	${WRITE_API_SERVER_BASE_URL}/ \
	-d @- <<EOS
{
  "query": "mutation CreateGroupChat(\$input: CreateGroupChatInput!) { createGroupChat(input: \$input) { groupChatId } }",
  "variables": {
    "input": {
      "name": "group-chat-example",
      "executorId": "${ADMIN_ID}"
    }
  }
}
EOS
)

if echo $CREATE_GROUP_CHAT_RESULT | jq -e .errors > /dev/null; then
  echo "Error: $CREATE_GROUP_CHAT_RESULT"
  exit 1
fi

echo "Result: $CREATE_GROUP_CHAT_RESULT"

GROUP_CHAT_ID=$(echo $CREATE_GROUP_CHAT_RESULT | jq -r .data.createGroupChat.groupChatId)

# メンバー追加
echo -e "\nAdd Member(${GROUP_CHAT_ID}, ${USER_ACCOUNT_ID}, ${ADMIN_ID}):"
ADD_MEMBER_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
	${WRITE_API_SERVER_BASE_URL}/ \
	-d @- <<EOS
{
  "query": "mutation AddMember(\$input: AddMemberInput!) { addMember(input: \$input) { groupChatId } }",
  "variables": {
    "input": {
      "groupChatId": "${GROUP_CHAT_ID}",
      "userAccountId": "${USER_ACCOUNT_ID}",
      "role": "MEMBER",
      "executorId": "${ADMIN_ID}"
    }
  }
}
EOS
)

if echo $ADD_MEMBER_RESULT | jq -e .errors > /dev/null; then
  echo "Error: $ADD_MEMBER_RESULT"
  exit 1
fi

echo "Result: $ADD_MEMBER_RESULT"

# メッセージ投稿
echo -e "\nPost Message(${GROUP_CHAT_ID}, ${USER_ACCOUNT_ID}):"
POST_MESSAGE_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
	${WRITE_API_SERVER_BASE_URL}/ \
	-d @- <<EOS
{
  "query": "mutation PostMessage(\$input: PostMessageInput!) { postMessage(input: \$input) { groupChatId, messageId } }",
  "variables": {
    "input": {
      "groupChatId": "${GROUP_CHAT_ID}",
      "content": "Text1",
      "executorId": "${USER_ACCOUNT_ID}"
    }
  }
}
EOS
)

if echo $POST_MESSAGE_RESULT | jq -e .errors > /dev/null; then
  echo "Error: $POST_MESSAGE_RESULT"
  exit 1
fi

echo "Result: $POST_MESSAGE_RESULT"

MESSAGE_ID=$(echo $POST_MESSAGE_RESULT | jq -r .data.postMessage.messageId)

wait_for_read_model_group_chat ""

# グループチャット取得
echo -e "\nGet GroupChat(${GROUP_CHAT_ID}, ${ADMIN_ID}):"
GET_GROUP_CHAT_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
	${READ_API_SERVER_BASE_URL}/ \
	-d @- <<EOS
{ "query": "{ getGroupChat(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${ADMIN_ID}\") { id, name, ownerId, createdAt, updatedAt } }" }
EOS
)

if echo $GET_GROUP_CHAT_RESULT | jq -e .errors > /dev/null; then
  echo "Error: $GET_GROUP_CHAT_RESULT"
  exit 1
fi

echo "Result: $GET_GROUP_CHAT_RESULT"

# グループチャットリスト取得
echo -e "\nGet GroupChats(${ADMIN_ID}):"
GET_GROUP_CHATS_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
	${READ_API_SERVER_BASE_URL}/ \
	-d @- <<EOS
{ "query": "{ getGroupChats(userAccountId: \"${ADMIN_ID}\") { id, name, ownerId, createdAt, updatedAt } }" }
EOS
)

if echo $GET_GROUP_CHATS_RESULT | jq -e .errors > /dev/null; then
  echo "Error: $GET_GROUP_CHATS_RESULT"
  exit 1
fi

echo "Result: $GET_GROUP_CHATS_RESULT"

# グループチャット名の変更
echo -e "\nRename GroupChat(${GROUP_CHAT_ID}, ${ADMIN_ID}):"
RENAME_GROUP_CHAT_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
	${WRITE_API_SERVER_BASE_URL}/ \
	-d @- <<EOS
{
  "query": "mutation RenameGroupChat(\$input: RenameGroupChatInput!) { renameGroupChat(input: \$input) { groupChatId } }",
  "variables": {
    "input": {
      "groupChatId": "${GROUP_CHAT_ID}",
      "name": "group-chat-example-2",
      "executorId": "${ADMIN_ID}"
    }
  }
}
EOS
)

if echo $RENAME_GROUP_CHAT_RESULT | jq -e .errors > /dev/null; then
  echo "Error: $RENAME_GROUP_CHAT_RESULT"
  exit 1
fi

echo "Result: $RENAME_GROUP_CHAT_RESULT"

wait_for_read_model_group_chat "group-chat-example-2"

# グループチャット取得
echo -e "\nGet GroupChat(${GROUP_CHAT_ID}, ${ADMIN_ID}):"
GET_GROUP_CHAT_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
	${READ_API_SERVER_BASE_URL}/ \
	-d @- <<EOS
{ "query": "{ getGroupChat(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${ADMIN_ID}\") { id, name, ownerId, createdAt, updatedAt } }" }
EOS
)

if echo $GET_GROUP_CHAT_RESULT | jq -e .errors > /dev/null; then
  echo "Error: $GET_GROUP_CHAT_RESULT "
  exit 1
fi

echo "Result: $GET_GROUP_CHAT_RESULT"

# メンバー取得
echo -e "\nGet Member(${GROUP_CHAT_ID}, ${USER_ACCOUNT_ID}):"
GET_MEMBER_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
	${READ_API_SERVER_BASE_URL}/ \
	-d @- <<EOS
{ "query": "{ getMember(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${USER_ACCOUNT_ID}\") { id, groupChatId, userAccountId, role, createdAt, updatedAt } }" }
EOS
)

if echo $GET_MEMBER_RESULT | jq -e .errors > /dev/null; then
  echo "Error: $GET_MEMBER_RESULT "
  exit 1
fi

echo "Result: $GET_MEMBER_RESULT"

# メンバーリスト取得
echo -e "\nGet Members(${GROUP_CHAT_ID}, ${USER_ACCOUNT_ID}):"
GET_MEMBERS_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
	${READ_API_SERVER_BASE_URL}/ \
	-d @- <<EOS
{ "query": "{ getMembers(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${USER_ACCOUNT_ID}\") { id, groupChatId, userAccountId, role, createdAt, updatedAt } }" }
EOS
)

if echo $GET_MEMBERS_RESULT | jq -e .errors > /dev/null; then
  echo "Error: $GET_MEMBERS_RESULT "
  exit 1
fi

echo "Result: $GET_MEMBERS_RESULT"

# メッセージ取得
echo -e "\nGet Message(${MESSAGE_ID}, ${USER_ACCOUNT_ID}):"
GET_MESSAGE_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
	${READ_API_SERVER_BASE_URL}/ \
	-d @- <<EOS
{ "query": "{ getMessage(messageId: \"${MESSAGE_ID}\", userAccountId: \"${USER_ACCOUNT_ID}\") { id, groupChatId, text, createdAt, updatedAt } }" }
EOS
)

if echo $GET_MESSAGE_RESULT | jq -e .errors > /dev/null; then
  echo "Error: $GET_MESSAGE_RESULT "
  exit 1
fi

echo "Result: $GET_MESSAGE_RESULT"

# メッセージリスト取得
echo -e "\nGet Messages(${GROUP_CHAT_ID}, ${USER_ACCOUNT_ID}):"
GET_MESSAGES_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
	${READ_API_SERVER_BASE_URL}/ \
	-d @- <<EOS
{ "query": "{ getMessages(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${USER_ACCOUNT_ID}\") { id, groupChatId, text, createdAt, updatedAt } }" }
EOS
)

if echo $GET_MESSAGES_RESULT | jq -e .errors > /dev/null; then
  echo "Error: $GET_MESSAGES_RESULT"
  exit 1
fi

echo "Result: $GET_MESSAGES_RESULT"

# メッセージの削除
echo -e "\nDelete Message(${GROUP_CHAT_ID}, ${MESSAGE_ID}, ${USER_ACCOUNT_ID}):"
DELETE_MESSAGE_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
	${WRITE_API_SERVER_BASE_URL}/ \
	-d @- <<EOS
{
  "query": "mutation DeleteMessage(\$input: DeleteMessageInput!) { deleteMessage(input: \$input) { groupChatId } }",
  "variables": {
    "input": {
      "groupChatId": "${GROUP_CHAT_ID}",
      "messageId": "${MESSAGE_ID}",
      "executorId": "${USER_ACCOUNT_ID}"
    }
  }
}
EOS
)

if echo $DELETE_MESSAGE_RESULT | jq -e .errors > /dev/null; then
  echo "Error: $DELETE_MESSAGE_RESULT"
  exit 1
fi

echo "Result: $DELETE_MESSAGE_RESULT"

# メンバーの削除
echo -e "\nRemove Member(${GROUP_CHAT_ID}, ${USER_ACCOUNT_ID}, ${ADMIN_ID}):"
REMOVE_MEMBER_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
	${WRITE_API_SERVER_BASE_URL}/ \
	-d @- <<EOS
{
  "query": "mutation RemoveMember(\$input: RemoveMemberInput!) { removeMember(input: \$input) { groupChatId } }",
  "variables": {
    "input": {
      "groupChatId": "${GROUP_CHAT_ID}",
      "userAccountId": "${USER_ACCOUNT_ID}",
      "executorId": "${ADMIN_ID}"
    }
  }
}
EOS
)

if echo $REMOVE_MEMBER_RESULT | jq -e .errors > /dev/null; then
  echo "Error: $REMOVE_MEMBER_RESULT"
  exit 1
fi

echo "Result: $REMOVE_MEMBER_RESULT"

# ルームの削除
echo -e "\nDelete GroupChat(${GROUP_CHAT_ID}, ${ADMIN_ID}):"
DELETE_GROUP_CHAT_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
	${WRITE_API_SERVER_BASE_URL}/ \
	-d @- <<EOS
{
  "query": "mutation DeleteGroupChat(\$input: DeleteGroupChatInput!) { deleteGroupChat(input: \$input) { groupChatId } }",
  "variables": {
    "input": {
      "groupChatId": "${GROUP_CHAT_ID}",
      "executorId": "${ADMIN_ID}"
    }
  }
}
EOS
)

if echo $DELETE_GROUP_CHAT_RESULT | jq -e .errors > /dev/null; then
  echo "Error: $DELETE_GROUP_CHAT_RESULT"
  exit 1
fi

echo "Result: $DELETE_GROUP_CHAT_RESULT"