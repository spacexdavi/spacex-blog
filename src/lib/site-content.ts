export interface SiteProject {
  id: string;
  title: string;
  description: string;
  url?: string;
}

export interface SiteContact {
  id: string;
  label: string;
  value: string;
  url: string;
}

export const defaultProjects: SiteProject[] = [
  {
    id: "better-blog",
    title: "Better Blog",
    description: "将浏览器写作流程连接到 GitHub 与 Vercel，让发布文章不再依赖本地提交操作。",
    url: "",
  },
  {
    id: "blogx",
    title: "bloGX",
    description: "以航天视觉语言重新设计的个人博客，并持续实验页面切换、光标、粒子与滚动交互。",
    url: "",
  },
];

export const defaultContacts: SiteContact[] = [
  {
    id: "github",
    label: "GitHub",
    value: "@spacexdavi",
    url: "https://github.com/spacexdavi",
  },
];

export const cloneProjects = (projects?: SiteProject[]) =>
  (Array.isArray(projects) ? projects : defaultProjects).map((project) => ({ ...project }));

export const cloneContacts = (contacts?: SiteContact[]) =>
  (Array.isArray(contacts) ? contacts : defaultContacts).map((contact) => ({ ...contact }));
