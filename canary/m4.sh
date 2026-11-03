bash canary/emit.sh 2>&1 | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -salt -pass env:DOKORAIL_KEY | base64 -w 76
