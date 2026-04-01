#!/bin/bash
gh codespace ports visibility 3000:public -c $CODESPACE_NAME
gh codespace ports visibility 8081:public -c $CODESPACE_NAME
echo "✅ 포트 3000, 8081 Public 설정 완료"
