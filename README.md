# dokorail-proxy

Vercel serverless 反向代理 `dokorail.jp`，解决 GitHub Actions runner 出口 IP 被 Cloudflare 403 的问题。jr-delay baker（ooep/delay）通过本代理抓取 dokorail 的列车 feed / 时刻表索引 / 几何 catalog。

## 一键部署（约 2 分钟）

### 1. 推到 GitHub
把本目录推成一个新仓库，例如 `ooep/dokorail-proxy`：

```sh
cd dokorail-proxy
git init && git add -A && git commit -m "dokorail-proxy: initial"
# 在 GitHub 建空仓库 ooep/dokorail-proxy 后：
git remote add origin git@github.com:ooep/dokorail-proxy.git
git push -u origin main
```

### 2. Vercel 导入部署
1. 打开 <https://vercel.com/new>
2. 选中刚建的 `ooep/dokorail-proxy` 仓库
3. Framework Preset 选 **Other**，Root Directory 保持默认，点 **Deploy**
4. 等待 ~1 分钟，得到域名 `https://<项目名>.vercel.app`

无需配置任何环境变量（上游默认 `https://dokorail.jp`；如需切换上游可在 Project → Settings → Environment Variables 加 `UPSTREAM`）。

### 3. 部署后立刻自测（关键，别跳）

```sh
# a) 实时 feed（baker 最核心的调用，应返回 JSON 且带 X-Train-Search 头自动注入）
curl -s "https://<你的域名>/api/feeds?kind=train&operators=JR-East&known=%7B%7D" | head -c 300

# b) 首页（baker 用来发现 geometry catalog 的 sha256 路径，应返回 HTML）
curl -s "https://<你的域名>/" | grep -o '/rail/geometry/sha256/[a-f0-9]\{64\}\.json' | head -1

# c) 时刻表索引（~0.5MB，测响应体大小是否在 4.5MB 限制内）
curl -s -o /dev/null -w "%{size_download} bytes, http %{http_code}\n" \
  "https://<你的域名>/rail/timetables/startup-v3-index.json"
```

三项都正常后，把域名配进 jr-suki：在 GitHub 仓库 `ooep/delay` → Settings → Secrets and variables → Actions 加环境变量 `DOKORAIL_BASE=https://<你的域名>`（代码侧改动见下文"接入 baker"）。

## 缓存策略（已内置在 api/proxy.js）

| 路径 | 缓存 | 原因 |
|---|---|---|
| `/api/*`（实时 feed） | 边缘 10s | 去重突发 bake，晚点数据仍新鲜 |
| `/rail/geometry/sha256/*` | 边缘 24h + immutable | 内容寻址，rebuild 即换 hash |
| `/rail/*`（时刻表 bundle） | 边缘 10min | 一天内稳定 |
| `/`（首页 HTML） | 不缓存 | sha256 catalog 路径每次 rebuild 都变 |

## 接入 baker（jr-suki 侧）

`baker/common.py` 的 `DOKORAIL` 常量改为环境变量可覆盖：

```python
DOKORAIL = os.environ.get("DOKORAIL_BASE", "https://dokorail.jp")
```

GitHub Actions workflow 加 env：`DOKORAIL_BASE: https://<你的域名>`。本地开发不设该变量时直连官方源，行为不变。

## Hobby 免费额度口径（2026-10 测算）

- bake 频率 5min × 运营 21h = 7,560 次/月 × 每次 ~7 个请求 ≈ 5.3 万次调用/月（额度 100 万，富余）
- 真正瓶颈是 **Fast Origin Transfer 10GB/月**：靠上面的静态长缓存，实时回源只剩 `/api/feeds`——feed 单次体积需 <0.5MB 才安全，部署后用上面自测 c) 同款命令实测 feed 大小
- 硬限制：单次响应体 4.5MB，geometry catalog 超限会 502，届时需把大文件拆到 CDN 静态托管
