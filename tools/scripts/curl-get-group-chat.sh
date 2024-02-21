#!/usr/bin/env bash

READ_API_SERVER_BASE_URL="http://localhost:38082"
ADMIN_ID="UserAccount-01H42K4ABWQ5V2XQEP3A48VE0Z"

curl -s -X POST -H "Content-Type: application/json" \
	${READ_API_SERVER_BASE_URL}/query \
	-d @- <<EOS
{ "query": "{ getGroupChat(groupChatId: \"${GROUP_CHAT_ID}\", userAccountId: \"${ADMIN_ID}\") { id, name, ownerId, createdAt } }" }
EOS
