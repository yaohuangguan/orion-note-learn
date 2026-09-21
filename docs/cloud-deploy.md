# Cloudflare 云同步部署

前端继续部署在 Vercel。Cloudflare Worker 只负责账户、同步 API 和图片访问；D1 保存结构化数据，R2 保存图片原文件。

## 1. 登录并创建资源

~~~bash
npx wrangler login
npx wrangler d1 create orion-note-learn --location oc
npx wrangler r2 bucket create orion-note-learn-images --location oc
~~~

oc 让 D1 和 R2 优先放在 Oceania；需要面向其他主要地区时，可改成 apac、weur、enam 等位置提示。

D1 创建成功后会输出 database_id。把它填入根目录 wrangler.jsonc：

~~~jsonc
{
  "binding": "DB",
  "database_name": "orion-note-learn",
  "database_id": "这里替换为真实 database_id"
}
~~~

R2 bucket 默认保持私有，不需要开启 Public Development URL。浏览器通过 Worker 中不可猜测的图片地址读取文件。

## 2. 设置允许访问的前端域名

在 wrangler.jsonc 的 ALLOWED_ORIGINS 中保留本地地址，并填写正式 Vercel 域名：

~~~jsonc
"ALLOWED_ORIGINS": "http://localhost:5173,https://orion-note-learn.vercel.app"
~~~

这里使用精确来源匹配。若以后绑定自定义域名，把该 HTTPS 来源一并加入并重新部署 Worker。

## 3. 初始化 D1 并部署 Worker

先创建认证密钥。它不能写入 `wrangler.jsonc` 或提交到 Git：

~~~bash
npx wrangler secret put AUTH_PEPPER
~~~

按提示粘贴至少 32 个随机字符。可以先用下面的命令生成 32 字节随机值：

~~~bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
~~~

认证密钥设置完成后再迁移和部署：

~~~bash
npm run cloud:migrate
npm run cloud:deploy
~~~

cloud:migrate 会创建用户、会话、分块工作区、图片索引和登录限流表。cloud:deploy 会直接打包 TypeScript，无需先运行前端构建。部署完成后 Wrangler 会显示类似下面的地址：

~~~text
https://orion-note-learn-sync.<你的子域>.workers.dev
~~~

打开该地址的 /health 路径，应返回：

~~~json
{"ok":true,"service":"orion-note-learn-sync"}
~~~

## 4. 把 Worker 地址交给 Vercel

在 Vercel 项目的 Production 环境变量中添加：

~~~dotenv
VITE_SYNC_API_URL=https://orion-note-learn-sync.<你的子域>.workers.dev
~~~

然后重新部署前端。Vite 环境变量会写入构建产物，所以添加或修改后必须重新构建一次。

也可以使用 Vercel CLI：

~~~bash
vercel env add VITE_SYNC_API_URL production
vercel --prod
~~~

## 本地联调

复制 `.dev.vars.example` 为 `.dev.vars`，将示例值替换为至少 32 个随机字符，然后初始化本地 D1：

~~~bash
npm run cloud:migrate:local
npm run dev
~~~

npm run dev 会同时启动：

- Vite 前端：http://localhost:5173
- AI 转发服务：http://localhost:3001
- Cloudflare Worker：http://localhost:8787

本地 D1 和 R2 数据位于 Wrangler 的本地状态目录，不会写入线上资源。

## 数据行为

- 未登录时，笔记仍自动保存到浏览器 IndexedDB。
- 登录或注册后，本机与云端数据会合并；后续修改约 900 ms 后自动同步。
- D1 按约 1.5 MB 的安全大小分块保存工作区，避开单行 2 MB 限制。
- 已登录时粘贴图片会直接上传 R2，笔记只保存 Worker 图片 URL。
- 未登录或断网时图片先以 Base64 留在本机，恢复同步后自动迁移到 R2。
- 不再被任何笔记引用且上传超过 24 小时的图片，会在后续同步中从 R2 清理。
- AI API Key 仍只存在当前页面内存，不进入 D1、R2 或备份。

## 安全边界

- 密码在浏览器中使用 PBKDF2-SHA-256 完成 210,000 次推导；Worker 再使用 `AUTH_PEPPER` 做 HMAC-SHA-256，D1 只保存随机盐和 HMAC 校验值。
- `AUTH_PEPPER` 只放在 Cloudflare Secret 中。更换它会使现有账户无法登录，因此应在密码管理器中备份。
- 会话令牌只以 SHA-256 摘要存入 D1，浏览器保存原始令牌以保持登录。
- 注册和登录按来源 IP 限制为每 10 分钟 10 次尝试。
- R2 bucket 保持私有。图片通过 256 位随机能力地址读取；不要把私人图片 URL 发送给其他人。
- Worker 只接受配置在 ALLOWED_ORIGINS 中的浏览器来源。

建议仍定期导出完整 JSON 备份。云同步解决换设备和浏览器数据丢失问题，备份用于应对误删与账户资源配置错误。
