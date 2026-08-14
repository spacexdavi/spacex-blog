import { getCollection, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"posts">;

export function postSlug(id: string) {
  return id.replace(/\/index$/, "");
}

export function postUrl(post: Post) {
  return `/posts/${postSlug(post.id)}/`;
}

export function formatPostDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replaceAll("/", ".");
}

export async function getPublishedPosts() {
  const posts = await getCollection("posts", ({ data }) => !data.draft);
  return posts.sort(
    (a, b) => b.data.published.getTime() - a.data.published.getTime(),
  );
}
