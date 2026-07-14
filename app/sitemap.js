// Dynamic sitemap generator for Next.js
export default async function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://yourapp.com';
  
  // Static pages
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/search`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/bookmarks`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ];

  // You can add dynamic pages here by fetching from your database
  // Example: fetch public profiles, posts, etc.
  // const posts = await fetchPublicPosts();
  // const postUrls = posts.map(post => ({
  //   url: `${baseUrl}/post/${post.id}`,
  //   lastModified: new Date(post.updatedAt),
  //   changeFrequency: 'weekly',
  //   priority: 0.5,
  // }));

  return [
    ...staticPages,
    // ...postUrls,
  ];
}
