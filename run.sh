#!/usr/bin/env bash
# NeoCloud 3대 콘솔 로컬 실행: bash run.sh → http://127.0.0.1:8090
cd "$(dirname "$0")"
echo "고객: http://127.0.0.1:8090/customer/  운영: http://127.0.0.1:8090/ops/  비즈: http://127.0.0.1:8090/biz/"
python3 -m http.server 8090
