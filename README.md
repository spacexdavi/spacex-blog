# ORBITAL / LOG

一个从 `bloGX` 中的 SpaceX 风格页面提炼视觉语言、并结合浏览器直发文章能力完成的 Astro 静态博客。

## 已包含的页面

- `/`：全屏封面与分段文章首页
- `/archive/`：全部文章归档
- `/posts/<slug>/`：Markdown 文章页
- `/about/`：关于页面
- `/admin/write/`：浏览器写作、预览、更新与删除文章

## 本地运行

```bash
pnpm install
pnpm dev
```

构建检查：

```bash
pnpm check
pnpm build
```

## GitHub App 配置

1. 在 GitHub 的 `Settings → Developer settings → GitHub Apps` 创建 App。
2. 关闭 Webhook。
3. 将 `Repository permissions → Contents` 设置为 `Read and write`。
4. 只把 App 安装到这个博客仓库。
5. 记录 App ID，并生成 `.pem` 私钥。

私钥不要提交到仓库，也不要放进 Vercel 环境变量。发布时在 `/admin/write/` 页面临时选择即可。

## Vercel 环境变量

从 GitHub 导入本项目后，在 Vercel 设置：

```dotenv
PUBLIC_GITHUB_OWNER=你的GitHub用户名
PUBLIC_GITHUB_REPO=你的仓库名
PUBLIC_GITHUB_BRANCH=main
PUBLIC_GITHUB_APP_ID=你的GitHub App ID
PUBLIC_GITHUB_POSTS_PATH=src/content/posts
PUBLIC_GITHUB_IMAGES_PATH=public/blogs
```

保存后重新部署一次。以后网页端发布文章会产生新的 GitHub commit，Vercel 会自动重新构建网站。

## 文章文件结构

```text
src/content/posts/<slug>/index.md
public/blogs/<slug>/<图片文件>
```

后台删除文章时会同时删除这两个位置中的对应文件。Git 历史仍然保留，因此误删后可以恢复。

## 安全边界

- `.pem` 私钥只存在于当前页面内存，刷新页面后清除。
- GitHub App 应只授权当前博客仓库，并只开放 Contents 权限。
- `/admin/write/` 页面本身可以公开访问，但没有私钥就无法向仓库写入内容。
