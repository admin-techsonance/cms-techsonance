import { db } from '@/db';
import { blogs } from '@/db/schema';

async function main() {
    const currentTimestamp = new Date().toISOString();
    
    const sampleBlogs = [
        {
            title: 'The Future of Web Development',
            slug: 'future-of-web-development',
            content: 'Comprehensive article about web dev trends including AI integration, edge computing, and the rise of Web3 technologies. Modern web development is evolving rapidly with new frameworks and tools emerging constantly. Developers must stay updated with latest trends to remain competitive in the market. This article explores the most significant trends shaping the future of web development.',
            excerpt: 'Explore upcoming trends in web development',
            featuredImage: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085',
            authorId: 1,
            category: 'Technology',
            tags: ['Web Development', 'Trends', 'JavaScript'],
            status: 'published',
            views: 125,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
            publishedAt: '2024-01-15T10:00:00.000Z',
        },
        {
            title: 'Best Practices for React Applications',
            slug: 'react-best-practices',
            content: 'In-depth guide to React patterns covering component composition, state management, performance optimization, and testing strategies. Learn how to structure your React applications for scalability and maintainability. Discover essential hooks patterns, custom hooks implementation, and when to use context vs prop drilling. This comprehensive guide includes real-world examples and code snippets.',
            excerpt: 'Learn essential React development patterns',
            featuredImage: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee',
            authorId: 3,
            category: 'Development',
            tags: ['React', 'Best Practices', 'Frontend'],
            status: 'published',
            views: 89,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
            publishedAt: '2024-02-01T14:30:00.000Z',
        },
        {
            title: 'Managing Remote Development Teams',
            slug: 'managing-remote-teams',
            content: 'Tips and strategies for remote team management including communication tools, productivity tracking, building team culture, and overcoming timezone challenges. Remote work has become the new normal, and managing distributed teams requires different approaches compared to traditional office settings. This article shares proven strategies for maintaining team cohesion and productivity.',
            excerpt: 'Effective strategies for distributed teams',
            featuredImage: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c',
            authorId: 2,
            category: 'Management',
            tags: ['Remote Work', 'Team Management', 'Leadership'],
            status: 'published',
            views: 67,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
            publishedAt: '2024-02-15T09:00:00.000Z',
        },
        {
            title: 'Introduction to TypeScript',
            slug: 'intro-to-typescript',
            content: 'Getting started with TypeScript covering basic types, interfaces, generics, and advanced type features. TypeScript has become the industry standard for large-scale JavaScript applications. This beginner-friendly guide will walk you through the fundamentals and help you understand why TypeScript is essential for modern development. Learn about type annotations, type inference, and how to migrate from JavaScript.',
            excerpt: "A beginner's guide to TypeScript",
            featuredImage: null,
            authorId: 4,
            category: 'Development',
            tags: ['TypeScript', 'Tutorial', 'Programming'],
            status: 'draft',
            views: 0,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
            publishedAt: null,
        },
    ];

    await db.insert(blogs).values(sampleBlogs);
    
    console.log('✅ Blogs seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});