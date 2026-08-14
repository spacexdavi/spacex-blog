import { KJUR, KEYUTIL } from "jsrsasign";
import type { SiteContact, SiteProject } from "./site-content";

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";

export interface PublisherConfig {
  owner: string;
  repo: string;
  branch: string;
  appId: string;
  postsPath: string;
  imagesPath: string;
  siteLayoutPath?: string;
}

export interface SiteLayoutElement {
  text?: string;
  x?: number;
  y?: number;
  fontSize?: number;
}

export interface SiteLayoutConfig {
  version: number;
  updatedAt?: string;
  elements: Record<string, SiteLayoutElement>;
  projects?: SiteProject[];
  contacts?: SiteContact[];
}

export interface LocalPublishImage {
  file: File;
  filename: string;
  previewUrl?: string;
}

export interface PublishPostInput {
  title: string;
  slug: string;
  published: string;
  summary: string;
  category: string;
  tags: string[];
  body: string;
  coverUrl?: string;
  coverFilename?: string;
  featured?: boolean;
  images: LocalPublishImage[];
}

type TreeItem = {
  path: string;
  mode: "100644";
  type: "blob";
  sha: string | null;
};

function apiHeaders(token: string, bearer = false) {
  return {
    Authorization: `${bearer ? "Bearer" : "token"} ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "Content-Type": "application/json",
  };
}

async function responseJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.message ? `：${body.message}` : "";
    } catch {
      detail = "";
    }
    throw new Error(`${label}失败（${response.status}）${detail}`);
  }
  return response.json() as Promise<T>;
}

function encodeRepoPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function signAppJwt(appId: string, privateKeyPem: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now - 30, exp: now + 8 * 60, iss: appId };
  const key = KEYUTIL.getKey(privateKeyPem) as unknown as string;
  return KJUR.jws.JWS.sign(
    "RS256",
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
    JSON.stringify(payload),
    key,
  );
}

export function missingPublisherConfig(config: PublisherConfig) {
  const missing: string[] = [];
  if (!config.owner) missing.push("PUBLIC_GITHUB_OWNER");
  if (!config.repo) missing.push("PUBLIC_GITHUB_REPO");
  if (!config.branch) missing.push("PUBLIC_GITHUB_BRANCH");
  if (!config.appId) missing.push("PUBLIC_GITHUB_APP_ID");
  if (!config.postsPath) missing.push("PUBLIC_GITHUB_POSTS_PATH");
  if (!config.imagesPath) missing.push("PUBLIC_GITHUB_IMAGES_PATH");
  return missing;
}

export function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[<>:"/\\|?*#%]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function getInstallationToken(
  config: PublisherConfig,
  privateKeyPem: string,
) {
  const jwt = signAppJwt(config.appId, privateKeyPem);
  const installationResponse = await fetch(
    `${API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/installation`,
    { headers: apiHeaders(jwt, true) },
  );
  const installation = await responseJson<{ id: number }>(
    installationResponse,
    "查找 GitHub App 安装信息",
  );

  const tokenResponse = await fetch(
    `${API}/app/installations/${installation.id}/access_tokens`,
    { method: "POST", headers: apiHeaders(jwt, true), body: "{}" },
  );
  const token = await responseJson<{ token: string }>(
    tokenResponse,
    "获取临时发布令牌",
  );
  return token.token;
}

async function getBranchHead(config: PublisherConfig, token: string) {
  const response = await fetch(
    `${API}/repos/${config.owner}/${config.repo}/git/ref/heads/${encodeURIComponent(config.branch)}`,
    { headers: apiHeaders(token) },
  );
  const data = await responseJson<{ object: { sha: string } }>(
    response,
    "读取分支",
  );
  return data.object.sha;
}

async function getCommitTree(
  config: PublisherConfig,
  token: string,
  commitSha: string,
) {
  const response = await fetch(
    `${API}/repos/${config.owner}/${config.repo}/git/commits/${commitSha}`,
    { headers: apiHeaders(token) },
  );
  const data = await responseJson<{ tree: { sha: string } }>(
    response,
    "读取当前文件树",
  );
  return data.tree.sha;
}

async function createBlob(
  config: PublisherConfig,
  token: string,
  content: string,
  encoding: "utf-8" | "base64",
) {
  const response = await fetch(
    `${API}/repos/${config.owner}/${config.repo}/git/blobs`,
    {
      method: "POST",
      headers: apiHeaders(token),
      body: JSON.stringify({ content, encoding }),
    },
  );
  return responseJson<{ sha: string }>(response, "上传文章内容");
}

async function createTree(
  config: PublisherConfig,
  token: string,
  baseTree: string,
  tree: TreeItem[],
) {
  const response = await fetch(
    `${API}/repos/${config.owner}/${config.repo}/git/trees`,
    {
      method: "POST",
      headers: apiHeaders(token),
      body: JSON.stringify({ base_tree: baseTree, tree }),
    },
  );
  return responseJson<{ sha: string }>(response, "创建文章文件树");
}

async function createCommit(
  config: PublisherConfig,
  token: string,
  message: string,
  treeSha: string,
  parentSha: string,
) {
  const response = await fetch(
    `${API}/repos/${config.owner}/${config.repo}/git/commits`,
    {
      method: "POST",
      headers: apiHeaders(token),
      body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] }),
    },
  );
  return responseJson<{ sha: string; html_url: string }>(
    response,
    "创建 GitHub 提交",
  );
}

async function updateBranch(
  config: PublisherConfig,
  token: string,
  commitSha: string,
) {
  const response = await fetch(
    `${API}/repos/${config.owner}/${config.repo}/git/refs/heads/${encodeURIComponent(config.branch)}`,
    {
      method: "PATCH",
      headers: apiHeaders(token),
      body: JSON.stringify({ sha: commitSha, force: false }),
    },
  );
  await responseJson(response, "更新发布分支");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return btoa(binary);
}

function yamlText(value: string) {
  return JSON.stringify(value.trim());
}

function buildPostFile(input: PublishPostInput, safeSlug: string) {
  const cover = input.coverFilename
    ? `/${input.coverFilename.startsWith("/") ? input.coverFilename.slice(1) : `${safeSlug}/${input.coverFilename}`}`
    : input.coverUrl?.trim() || "/images/hero-flight.jpg";
  const normalizedCover = input.coverFilename
    ? `/${input.coverFilename.includes("/") ? input.coverFilename : `blogs/${safeSlug}/${input.coverFilename}`}`
    : cover;

  let body = input.body.trim();
  for (const image of input.images) {
    body = body.replaceAll(
      `(local-image:${image.filename})`,
      `(/blogs/${safeSlug}/${image.filename})`,
    );
  }

  return [
    "---",
    `title: ${yamlText(input.title)}`,
    `published: ${input.published}`,
    `summary: ${yamlText(input.summary)}`,
    `cover: ${yamlText(normalizedCover)}`,
    `category: ${yamlText(input.category || "JOURNAL")}`,
    `tags: ${JSON.stringify(input.tags)}`,
    `featured: ${Boolean(input.featured)}`,
    "draft: false",
    "---",
    "",
    body,
    "",
  ].join("\n");
}

export async function prepareLocalImage(file: File): Promise<LocalPublishImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = [...digest]
    .slice(0, 10)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const extension = file.name.match(/\.[a-zA-Z0-9]+$/)?.[0]?.toLowerCase() || ".bin";
  return {
    file,
    filename: `${hash}${extension}`,
    previewUrl: URL.createObjectURL(file),
  };
}

export async function postExists(
  config: PublisherConfig,
  token: string,
  slug: string,
) {
  const path = `${config.postsPath.replace(/\/+$/g, "")}/${normalizeSlug(slug)}/index.md`;
  const response = await fetch(
    `${API}/repos/${config.owner}/${config.repo}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(config.branch)}`,
    { headers: apiHeaders(token) },
  );
  if (response.status === 404) return false;
  if (!response.ok) await responseJson(response, "检查文章路径");
  return true;
}

export async function publishPost(
  config: PublisherConfig,
  privateKeyPem: string,
  input: PublishPostInput,
) {
  const safeSlug = normalizeSlug(input.slug);
  if (!safeSlug) throw new Error("Slug 不能为空");

  const token = await getInstallationToken(config, privateKeyPem);
  const existed = await postExists(config, token, safeSlug);
  const headSha = await getBranchHead(config, token);
  const baseTree = await getCommitTree(config, token, headSha);
  const postFile = buildPostFile(input, safeSlug);
  const postBlob = await createBlob(config, token, postFile, "utf-8");
  const tree: TreeItem[] = [
    {
      path: `${config.postsPath.replace(/\/+$/g, "")}/${safeSlug}/index.md`,
      mode: "100644",
      type: "blob",
      sha: postBlob.sha,
    },
  ];

  for (const image of input.images) {
    const content = bytesToBase64(new Uint8Array(await image.file.arrayBuffer()));
    const blob = await createBlob(config, token, content, "base64");
    tree.push({
      path: `${config.imagesPath.replace(/\/+$/g, "")}/${safeSlug}/${image.filename}`,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  const nextTree = await createTree(config, token, baseTree, tree);
  const commit = await createCommit(
    config,
    token,
    `${existed ? "更新" : "发布"}文章: ${safeSlug}`,
    nextTree.sha,
    headSha,
  );
  await updateBranch(config, token, commit.sha);
  return { existed, commitUrl: commit.html_url, slug: safeSlug };
}

export async function publishSiteLayout(
  config: PublisherConfig,
  privateKeyPem: string,
  layout: SiteLayoutConfig,
) {
  const token = await getInstallationToken(config, privateKeyPem);
  const headSha = await getBranchHead(config, token);
  const baseTree = await getCommitTree(config, token, headSha);
  const path = (config.siteLayoutPath || "src/data/site-layout.json")
    .replace(/^\/+|\/+$/g, "");
  const content = `${JSON.stringify(layout, null, 2)}\n`;
  const blob = await createBlob(config, token, content, "utf-8");
  const nextTree = await createTree(config, token, baseTree, [
    { path, mode: "100644", type: "blob", sha: blob.sha },
  ]);
  const commit = await createCommit(
    config,
    token,
    "更新首页页面设置",
    nextTree.sha,
    headSha,
  );
  await updateBranch(config, token, commit.sha);
  return { commitUrl: commit.html_url, path };
}

async function listRepositoryTree(
  config: PublisherConfig,
  token: string,
  treeSha: string,
) {
  const response = await fetch(
    `${API}/repos/${config.owner}/${config.repo}/git/trees/${treeSha}?recursive=1`,
    { headers: apiHeaders(token) },
  );
  return responseJson<{ tree: Array<{ path: string; type: string }> }>(
    response,
    "读取文章文件",
  );
}

export async function deletePost(
  config: PublisherConfig,
  privateKeyPem: string,
  slug: string,
) {
  const safeSlug = normalizeSlug(slug);
  const token = await getInstallationToken(config, privateKeyPem);
  const headSha = await getBranchHead(config, token);
  const baseTree = await getCommitTree(config, token, headSha);
  const repositoryTree = await listRepositoryTree(config, token, baseTree);
  const postPrefix = `${config.postsPath.replace(/\/+$/g, "")}/${safeSlug}/`;
  const imagePrefix = `${config.imagesPath.replace(/\/+$/g, "")}/${safeSlug}/`;
  const files = repositoryTree.tree.filter(
    (item) =>
      item.type === "blob" &&
      (item.path.startsWith(postPrefix) || item.path.startsWith(imagePrefix)),
  );
  if (!files.length) throw new Error("没有找到这篇文章的文件，它可能已经被删除");

  const deletions: TreeItem[] = files.map((file) => ({
    path: file.path,
    mode: "100644",
    type: "blob",
    sha: null,
  }));
  const nextTree = await createTree(config, token, baseTree, deletions);
  const commit = await createCommit(
    config,
    token,
    `删除文章: ${safeSlug}`,
    nextTree.sha,
    headSha,
  );
  await updateBranch(config, token, commit.sha);
  return { commitUrl: commit.html_url, slug: safeSlug };
}
